const assert=require('node:assert/strict');let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const base=process.env.BASE_URL||'http://127.0.0.1:8794';
(async()=>{const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(require('fs').existsSync('/opt/pw-browsers/chromium')?'/opt/pw-browsers/chromium':'/usr/bin/chromium'),args:['--no-sandbox']});try{
const ctx=await b.newContext({viewport:{width:1440,height:1100},serviceWorkers:'block'}),outside=[],errors=[];
await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(base).origin)return r.continue();if(new URL(r.request().url()).pathname==='/rest/v1/rpc/app_aluno_busca')return r.fulfill({status:200,contentType:'application/json',body:'[]'});outside.push(r.request().url());return r.abort();});
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.clock.setFixedTime(new Date('2026-10-04T12:00:00Z'));
await p.goto(base+'/demo-personal.html');await p.click('#btnDemo');await p.waitForURL('**/personal.html');await p.waitForFunction(()=>window.__dadosApp&&document.querySelector('#mpEditor'));
await p.evaluate(()=>{const st=MTStore.read('ptStudio',{});st.exercicios.push({id:'test-homonym-a',nome:'Homônimo fictício',grupo:'Peito'},{id:'test-homonym-b',nome:'Homônimo fictício',grupo:'Peito'});MTStore.write('ptStudio',st);});await p.reload();await p.waitForFunction(()=>window.__dadosApp&&document.querySelector('#mpEditor'));
const legacy=await p.evaluate(()=>MTStore.read('ptStudio',{}).config.conquistas||[]);
await p.click('[data-a="pers"]');await p.selectOption('#persArea','medalhas');await p.click('#mpEditor summary');await p.fill('#mpNome','Distância fictícia');await p.fill('#mpAlvo','10');await p.fill('#mpInicio','2026-10-04');await p.click('#mpSalvar');assert.match(await p.locator('#mpStatus').innerText(),/data futura/);
await p.fill('#mpInicio','2026-10-05');await p.evaluate(()=>{window.oldWrite=MTStore.write;MTStore.write=(k,v)=>k==='ptStudio'?false:oldWrite(k,v)});await p.click('#mpSalvar');assert.match(await p.locator('#mpStatus').innerText(),/rascunho/);assert.equal(await p.inputValue('#mpNome'),'Distância fictícia');
await p.evaluate(()=>MTStore.write=oldWrite);await p.click('#mpSalvar');assert.match(await p.locator('#mpLista').innerText(),/10 km/);
await p.selectOption('#mpTipo','carga');await p.selectOption('#mpExercicio','test-homonym-a');assert.equal(await p.locator('#mpExercicio option').filter({hasText:'Homônimo fictício'}).count(),2);assert.notEqual(await p.locator('#mpExercicio option[value="test-homonym-a"]').innerText(),await p.locator('#mpExercicio option[value="test-homonym-b"]').innerText());assert.equal(await p.locator('#mpExLabel').isVisible(),true);assert.equal(await p.locator('#mpModLabel').isVisible(),false);await p.fill('#mpNome','Carga fictícia');await p.fill('#mpAlvo','50');await p.click('#mpSalvar');assert.match(await p.locator('#mpLista').innerText(),/50 kg/);
assert.deepEqual(await p.evaluate(()=>MTStore.read('ptStudio',{}).config.conquistas||[]),legacy);
const dto=await p.evaluate(()=>__dadosApp(MTStore.read('ptStudio',{}).alunos[0],'test'));assert.equal(dto.metasPersonalizadasApp.length,2);assert.equal(dto.metasPersonalizadasApp[1].exercicioId,'test-homonym-a');assert.equal(dto.metasPersonalizadasApp[1].exercicio,'Homônimo fictício');assert.ok(dto.guiaFichasP[0].it[0].exercicioId);
// Execute the actual serialized student modules, with controlled local records and identity.
const student=await ctx.newPage();await student.goto(base+'/demo-personal.html');await student.setContent('<meta charset="utf-8"><div id="cqGrid"></div>');await student.addScriptTag({url:base+'/app/metas-personalizadas.js'});await student.addScriptTag({url:base+'/app/metas-aluno.js'});
await student.evaluate(defs=>{window.currentToken='fake-A';window.sample={hoje:'2026-10-06',cardio:[{id:'old',d:'2026-10-05',m:'corrida',k:99,s:3600,status:'completo'}],cargas:{}};window.goals=defs;window.ui=MT_METAS_ALUNO.runtime(MT_METAS_PESSOAIS,defs,{token:'fake-A',identity:()=>currentToken==='fake-A',snapshot:()=>sample},{});ui.pinta();},dto.metasPersonalizadasApp);
assert.doesNotMatch(await student.locator('#mpAluno').innerText(),/Meta alcançada/);
await student.evaluate(()=>{sample.cargas={'Homônimo fictício':[{d:'2026-10-06',g:2,i:'0:0:0',kg:100,feito:true,serie:1},{d:'2026-10-06',g:2,i:'0:1:0',kg:100,feito:true,serie:1,exercicioId:'test-homonym-b'}]};ui.pinta();});assert.match(await student.locator('#mpAluno article').nth(1).innerText(),/Dados insuficientes/);assert.match(await student.locator('#mpAluno').innerText(),/não sincroniza entre dispositivos/);

await student.evaluate(()=>{sample.cardio.push({id:'new',d:'2026-10-06',m:'corrida',k:10,s:3600,status:'completo'});ui.pinta();});assert.match(await student.locator('#mpAluno').innerText(),/Meta alcançada/);
await student.evaluate(()=>{sample.cardio[1].k=8;ui.pinta();});assert.match(await student.locator('#mpAluno').innerText(),/Precisa de revisão/);assert.match(await student.locator('#mpAluno').textContent(),/Meta alcançada com registros/);
await student.evaluate(()=>{sample.cardio[1].k=10;ui.pinta();});assert.match(await student.locator('#mpAluno').innerText(),/Precisa de revisão/);
const before=await student.evaluate(()=>localStorage.getItem(ui.chave));await student.evaluate(()=>{currentToken='fake-B';sample.cardio=[];ui.pinta();});assert.equal(await student.evaluate(()=>localStorage.getItem(ui.chave)),before);
await student.evaluate(()=>{window.other=MT_METAS_ALUNO.runtime(MT_METAS_PESSOAIS,goals,{token:'fake-B',identity:()=>true,snapshot:()=>sample},{});other.pinta();});assert.notEqual(await student.evaluate(()=>other.chave),await student.evaluate(()=>ui.chave));assert.doesNotMatch(await student.locator('#mpAluno').innerText(),/Precisa de revisão/);
await student.evaluate(()=>{sample.cardio=[{id:'b-new',d:'2026-10-06',m:'corrida',k:10,s:3600,status:'completo'}];window.setOriginal=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k===other.chave)throw Error('quota');return setOriginal.call(this,k,v);};other.pinta();});assert.match(await student.locator('#mpAluno').innerText(),/Nenhuma nova conquista foi confirmada/);assert.doesNotMatch(await student.locator('#mpAluno strong').first().innerText(),/Meta alcançada/);
await student.evaluate(()=>{Storage.prototype.setItem=setOriginal;other.pinta();});assert.match(await student.locator('#mpAluno').innerText(),/Meta alcançada/);

for(const width of [320,390,1440]){await p.setViewportSize({width,height:1000});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
// Builder actually embeds both modules in the published student HTML.
const html=await p.evaluate(d=>MT_APP_ALUNO.monta(d),dto);assert.match(html,/window.__metasAluno=/);assert.match(html,/ptmetasAudit:/);const real=await ctx.newPage();real.on('pageerror',e=>errors.push(e.message));
const generated=await p.evaluate(d=>{d.a.appTokenP='';const old=window.MT_CLOUD;window.MT_CLOUD=null;try{return MT_APP_ALUNO.monta(d);}finally{window.MT_CLOUD=old;}},dto);
await real.route('**/metas-test.html',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:generated}));await real.goto(base+'/metas-test.html');await real.waitForFunction(()=>window.__metasAluno&&document.querySelector('#mpAluno')&&__treinoHistorico.ready());
assert.equal(await real.locator('#mpAluno article').count(),2);
const writer=await real.evaluate(item=>{localStorage.setItem('ptdc','{}');__gGrava(item.e,50,8,'0:0:0');let rows=JSON.parse(localStorage.getItem('ptdc'))[item.e];const first=rows[0].exercicioId;__gGrava(item.e,60,8,'0:0:0');rows=JSON.parse(localStorage.getItem('ptdc'))[item.e];return {first,corrected:rows[0].exercicioId};},dto.guiaFichasP[0].it[0]);assert.equal(writer.first,dto.guiaFichasP[0].it[0].exercicioId);assert.equal(writer.corrected,writer.first);
// Legado real começa antes do primeiro journal, em outro armazenamento. Apagar
// somente a projeção de um registro moderno não remove sua identidade histórica.
const legacyCtx=await b.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
await legacyCtx.route('**/*',r=>{if(new URL(r.request().url()).origin===new URL(base).origin)return r.continue();if(new URL(r.request().url()).pathname==='/rest/v1/rpc/app_aluno_busca')return r.fulfill({status:200,contentType:'application/json',body:'[]'});outside.push(r.request().url());return r.abort();});
await legacyCtx.route('**/metas-legacy-test.html',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:generated}));
await legacyCtx.addInitScript(({exercise,date})=>{if(window!==window.top||localStorage.getItem('ptdc')!==null)return;localStorage.setItem('ptdc',JSON.stringify({[exercise]:[{d:date,g:2,i:'0:0:0',serie:1,kg:50,r:8,feito:true}]}));},{exercise:dto.guiaFichasP[0].it[0].e,date:await real.evaluate(()=>isoHj())});
const legacyPage=await legacyCtx.newPage();legacyPage.on('pageerror',e=>errors.push(e.message));
await legacyPage.clock.setFixedTime(new Date(await real.evaluate(()=>Date.now())));
await legacyPage.goto(base+'/metas-legacy-test.html');await legacyPage.waitForFunction(()=>window.__treinoHistorico&&__treinoHistorico.ready());
assert.equal(await legacyPage.evaluate(()=>__treinoHistorico.list().length),0);
const legacyRow=await legacyPage.evaluate(item=>{__gGrava(item.e,70,8,'0:0:0');return JSON.parse(localStorage.getItem('ptdc'))[item.e][0];},dto.guiaFichasP[0].it[0]);assert.equal(legacyRow.kg,70);assert.equal(legacyRow.exercicioId,undefined);
await legacyPage.reload();await legacyPage.waitForFunction(()=>window.__treinoHistorico&&__treinoHistorico.ready());
const reloaded=await legacyPage.evaluate(exercise=>({row:L('ptdc',{})[exercise][0],record:__treinoHistorico.list()[0].targets['0:0:0'].value}),dto.guiaFichasP[0].it[0].e);
assert.equal(reloaded.row.kg,70);assert.equal(reloaded.row.exercicioId,undefined);assert.equal(reloaded.record.exercicioId,undefined);
await legacyCtx.close();

assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
console.log('OK metas: editor, prospective dates, save failure, load/modality, legacy, DTO, student award/review, token isolation and mobile');
}finally{await b.close()}})().catch(e=>{console.error(e);process.exit(1)});
