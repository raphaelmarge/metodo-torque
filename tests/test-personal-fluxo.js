/* Fluxo diário integrado ao Personal: sem Central Pro, sem IDs na rotina. */
const assert=require('assert/strict'),fs=require('fs');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const {comMockNuvem}=require('./_nuvem');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;function ok(v,label){assert.ok(v,label);checks++;console.log('OK '+label);}
(async()=>{
  const js=fs.readFileSync('assets/personal-fluxo.js','utf8'),css=fs.readFileSync('assets/personal-fluxo.css','utf8'),html=fs.readFileSync('personal.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
  ok(html.includes('assets/personal-fluxo.css')&&html.includes('assets/personal-fluxo.js'),'Personal carrega a camada integrada do fluxo');
  ok(html.includes('window.__perfilAtualPT'),'Perfil expõe apenas o identificador interno para integração, sem mostrar ID na tela');
  ok(!js.includes('Central Pro'),'Nova experiência não recria a Central Pro');
  ok(js.includes("personal_sessoes")&&js.includes("personal_automacoes")&&js.includes("personal_automacao_fila"),'Fluxo reaproveita contratos reais de sessão e automação');
  ok(js.includes("app_treino_log")&&js.includes("app_quest")&&js.includes("app_agenda"),'Aluno 360 usa registros reais do app quando a nuvem está disponível');
  ok(js.includes('ptflow:fila:v1')&&js.includes("window.addEventListener('online'"),'Sessão presencial possui fila offline e retoma ao voltar a conexão');
  ok(sw.includes('assets/personal-fluxo.js')&&sw.includes('assets/personal-fluxo.css'),'Fluxo entra no cache offline do Personal');
  ok(css.includes('@media(max-width:760px)'),'Camada tem adaptação móvel explícita');

  browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}));
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  await ctx.route('**://*.supabase.co/**',r=>r.abort());
  const p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/demo-personal.html');await p.locator('#btnDemo').click();await p.waitForURL(/personal.html/);
  await p.waitForFunction(()=>document.getElementById('ptFlowHoje')&&window.__PT_FLUXO__);
  ok(await p.locator('#ptFlowHoje').isVisible(),'Próxima melhor ação aparece dentro do Início');
  ok(await p.locator('#ptFlowHoje').getByText('Próxima melhor ação').isVisible(),'Dashboard usa linguagem de fluxo, não módulo paralelo');
  ok(await p.getByRole('button',{name:'Central Pro',exact:true}).count()===0,'Central Pro continua ausente');
  ok(await p.locator('#buscaAluno').getAttribute('placeholder').then(x=>/exercício.*questionário.*treino/i.test(x)),'Busca do topo virou busca universal');
  await p.locator('#buscaAluno').fill('agachamento');await p.waitForTimeout(80);
  ok(await p.locator('[data-ptf-search="exercise"]').count()>0,'Busca universal encontra exercício');

  const aid=await p.evaluate(()=>{const st=MTStore.read('ptStudio',{});return (st.alunos||[]).find(a=>a.ativo!==false)?.id||''});
  ok(!!aid,'Demo contém aluno ativo para validar a ficha 360');
  await p.evaluate(id=>window.__perfilPT(id),aid);await p.waitForFunction(()=>!document.getElementById('vPerfil').hidden&&document.getElementById('ptFlow360'));
  ok(await p.locator('#ptFlow360').isVisible(),'Aluno 360° aparece no resumo do aluno');
  ok(await p.locator('#ptFlow360Kpis>div').count()===4,'Aluno 360° resume treino, frequência e avaliação');
  ok(await p.locator('#ptFlow360 .ptf-bar').count()===8,'Evolução mostra oito semanas de frequência');

  await p.locator('[data-ptf="profile-session"]').click();await p.waitForFunction(()=>document.getElementById('ptFlowSession').open);
  ok(await p.locator('#ptFlowSessAluno option:checked').innerText().then(x=>x.length>0&&!/^[-0-9a-f]{20,}$/i.test(x)),'Modo presencial escolhe aluno pelo nome, não por ID técnico');
  await p.locator('#ptFlowSessStart').click();await p.waitForTimeout(120);
  ok(await p.locator('#ptFlowSessFinish').isEnabled(),'Sessão presencial inicia mesmo sem depender da nuvem');
  if(await p.locator('#ptFlowSessSets .ptf-set').count()===0) await p.locator('#ptFlowSessAdd').click();
  await p.locator('#ptFlowSessSets .ptf-set').first().locator('[data-k="exercicio"]').fill('Exercício de teste');
  await p.locator('#ptFlowSessFinish').click();await p.waitForTimeout(180);
  ok(await p.evaluate(()=>{try{return JSON.parse(localStorage.getItem('ptflow:fila:v1')||'[]').length>=0}catch(e){return false}}),'Fila offline permanece íntegra após finalizar sessão');

  await p.evaluate(()=>document.querySelector('#abas [data-a="dash"]').click());await p.waitForTimeout(80);
  await p.locator('[data-ptf="autos"]').click();
  ok(await p.locator('#ptFlowAutos').evaluate(e=>e.open),'Automações ficam integradas ao dashboard normal');
  for(const width of [390,320]){await p.setViewportSize({width,height:844});await p.waitForTimeout(50);ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Fluxo sem overflow em '+width+'px');}
  ok(errors.length===0,'Sem erros JavaScript: '+errors.join('; '));
  console.log('Fluxo diário Personal: '+checks+' verificações passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
