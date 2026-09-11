/* Editor real em DOM isolado; bridge em memória, sem conta nem rede. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(fs.existsSync('/opt/node22/lib/node_modules/playwright')?'/opt/node22/lib/node_modules/playwright':'playwright');
const root=path.join(__dirname,'..');let browser,n=0;function eq(a,b,m){assert.deepEqual(a,b,m);n++;console.log('OK '+m);}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});await ctx.route('**/*',r=>r.abort());const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.accept());
 await p.setContent(fs.readFileSync(path.join(root,'personal.html'),'utf8').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,''));
 await p.evaluate(()=>{const el=document.getElementById('vNutricao'),dialog=document.getElementById('pnFoodDialog');el.remove();dialog.remove();document.body.innerHTML='<select id="pfArea"><option value="treino">Treino</option></select><div id="pfAbas"><button data-pfa="treino">Treino</button><button data-pfa="alimentacao">Alimentação</button></div><section id="vPerfil" hidden></section><div id="pfNutricao"></div><button id="pfNutricaoAbrir"></button>';document.body.appendChild(el);document.body.appendChild(dialog);el.hidden=false;});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'assets/nutricao-core.js'),'utf8')});
 await p.addScriptTag({content:fs.readFileSync(path.join(root,'assets/personal-nutricao.js'),'utf8')});
 await p.evaluate(()=>{
  const food={id:'food',nome:'Alimento de teste',porcao:'porção demonstrativa',qtd:1,k:1,pt:1,cb:1,g:1};
  window.__st={alunos:[{id:'a',nome:'Aluno de teste',ativo:true,appTokenP:'ficticio'}],treinosV2:{preservar:true},nutricaoV1:{planos:{a:{v:1,id:'plano',ativo:true,titulo:'Rotina de teste',refeicoes:[{id:'tarde',titulo:'Refeição da tarde',hora:'16:00',itens:[food]},{id:'manha',titulo:'Refeição da manhã',hora:'07:30',itens:[food]}]}}}};
  const copy=v=>JSON.parse(JSON.stringify(v));let uid=0;window.__saves=0;window.__publicados=[];const memory={};
  Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory[k]||null,setItem:(k,v)=>memory[k]=String(v),removeItem:k=>delete memory[k]}});
  window.__draft=()=>JSON.parse(Object.values(memory).find(v=>JSON.parse(v)?.plano)||'null');
  window.MTStore={uid:()=>String(++uid),todayISO:()=> '2026-09-10',cloud:()=>null,usuario:()=>({email:'teste@example.invalid'})};
  window.MT_PERSONAL_NUTRICAO.init({load:()=>copy(window.__st),save:st=>{window.__st=copy(st);window.__saves++;return true;},marcaPendente:(st,id)=>st.pendente=id,perfilId:()=>'',acesso:()=>{},publicar:(id,cb)=>{window.__publicados.push(window.MT_PERSONAL_NUTRICAO.pacote(window.__st,id));cb({});}});
  window.MT_PERSONAL_NUTRICAO.abre('a');
 });
 await p.locator('#pnEditar').click();
 eq(await p.locator('.pn-days').first().evaluate(el=>el.open),true,'dias de cada refeição visíveis no editor');
 await p.locator('[data-pnref="0"][data-pnkey="hora"]').fill('18:45');
 await p.locator('[data-pndias="uteis"][data-pnri="0"]').click();eq(await p.evaluate(()=>__draft().plano.refeicoes[0].dias),[1,2,3,4,5],'atalho de dias úteis conserva o contrato');
 await p.locator('[data-pndias="fim"][data-pnri="1"]').click();eq(await p.evaluate(()=>__draft().plano.refeicoes[1].dias),[0,6],'fim de semana usa domingo=0 e sábado=6');
 await p.locator('[data-pndias="todos"][data-pnri="1"]').click();eq(await p.evaluate(()=>__draft().plano.refeicoes[1].dias),[],'todos os dias mantém formato compatível');
 for(const day of [0,1,2,3,5,6])await p.locator('[data-pnday="'+day+'"][data-pnri="1"]').uncheck();
 await p.locator('[data-pnday="4"][data-pnri="1"]').click();eq(await p.locator('[data-pnday="4"][data-pnri="1"]').isChecked(),true,'não permite tirar o último dia por acidente');
 await p.locator('#pnOrdenarHoras').click();eq(await p.evaluate(()=>__draft().plano.refeicoes.map(r=>r.id)),['manha','tarde'],'ordenar muda a ordem mas preserva identidades');
 eq(await p.evaluate(()=>__draft().plano.refeicoes.map(r=>[r.hora,r.dias])),[['07:30',[4]],['18:45',[1,2,3,4,5]]],'horários e dias continuam juntos após ordenar');
 eq(await p.evaluate(()=>__saves),0,'alterar horários não aplica nem publica o rascunho');
 for(const id of ['pnInicio','pnFim'])for(const d of await p.locator('#'+id).locator('xpath=ancestor::details').all())await d.evaluate(e=>e.open=true);
 await p.locator('#pnInicio').fill('2026-09-10');await p.locator('#pnFim').fill('2026-09-30');
 await p.locator('#pnRevisar').click();await p.locator('#pnAplicar').click();eq(await p.evaluate(()=>__saves),1,'aplicar salva pelo bridge canônico');
 eq(await p.evaluate(()=>__st.treinosV2),{preservar:true},'aplicar o plano não altera treino');
 eq(await p.evaluate(()=>__publicados.length),0,'aplicação ainda não publica sem decisão explícita');
 await p.locator('#pnPublicar').click();eq(await p.evaluate(()=>__publicados.length),1,'botão publica o pacote do aluno selecionado');
 eq(await p.evaluate(()=>__publicados[0].refeicoes.map(r=>[r.id,r.hora,r.dias])),[['manha','07:30',[4]],['tarde','18:45',[1,2,3,4,5]]],'pacote preserva horários, dias e IDs');
 eq(await p.evaluate(()=>[__publicados[0].inicio,__publicados[0].fim]),['2026-09-10','2026-09-30'],'vigência chega ao pacote');
 eq(await p.evaluate(()=>MT_NUTRICAO.refeicoesDia(__publicados[0],'2026-09-12').length),0,'fim de semana sem programação não recebe dieta');
 eq(errors,[],'editor sem erros JavaScript');console.log(n+' verificações de horários no editor passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
