/* Entrada da consultoria: configuração opcional, contrato versionado e fluxo móvel.
 * Todos os dados, tokens e respostas abaixo são fictícios; a nuvem é interceptada. */
process.env.TZ = "America/Sao_Paulo";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let chromium;
try { chromium = require("playwright").chromium; }
catch (_) { chromium = require("/opt/node22/lib/node_modules/playwright").chromium; }
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const FAKE = "https://onboarding-test.invalid";
global.self = global;
require("../assets/onboarding-consultoria.js");
const Core = global.MT_ONBOARDING_CONSULTORIA;
let browser, checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log("OK " + label); }
function eq(value, expected, label) { assert.deepEqual(value, expected, label); checks++; console.log("OK " + label); }

const questions = [
  { id:"oq1",sigla:"OBJ",titulo:"Objetivo",texto:"Qual é seu objetivo principal?",tipo:"texto",ops:[] },
  { id:"oq2",sigla:"ROT",titulo:"Rotina",texto:"Quanto sua rotina favorece os treinos?",tipo:"linear",ops:[] },
  { id:"oq3",sigla:"SAUDE",titulo:"Cuidados",texto:"Há dor, lesão, condição de saúde ou medicamento?",tipo:"texto",ops:[] },
];
function fixtureState() {
  return {
    config:{nome:"Studio Teste",onboardingConsultoria:{
      ativo:true,titulo:"Antes de começar",introducao:"Responda, confira seus dados e leia o contrato.",questionarioId:"oq",
      contratoAtivo:true,modoAssinatura:"assinatura",contratoTitulo:"Contrato de consultoria",contratoTexto:Core.CONTRATO_PADRAO,
      prestador:{nome:"Studio Teste",documento:"12.345.678/0001-95",endereco:"Rua Teste, 10, Centro, Belo Horizonte/MG, CEP 30110-000",email:"contato@studio.test",telefone:"(31) 99999-0000",cidade:"Belo Horizonte",uf:"MG"}
    }},
    questPerguntas:questions,questionarios:[{id:"oq",nome:"Entrada",perguntas:questions.map(x=>x.id)}]
  };
}
function testCore() {
  const st=fixtureState(),aluno={id:"aluno-a",nome:"Alex Silva",cpf:"529.982.247-25",nasc:"1990-05-20",email:"alex@teste.invalid",zap:"31999990000",valor:400,onboardingConsultoria:{requerido:true,revisao:"1"}};
  const pacote=Core.pacote(st,aluno,{plano:{nome:"Consultoria mensal",valor:400},contrato:{inicio:"2026-09-09"}});
  ok(/^oc-[a-f0-9]{16}$/.test(pacote.v),"pacote recebe versão estável");
  eq(Core.pacote(st,aluno,{plano:{nome:"Consultoria mensal",valor:400},contrato:{inicio:"2026-09-09"}}).v,pacote.v,"mesmos termos preservam a versão");
  st.questPerguntas[0].texto="Qual é sua prioridade agora?";
  ok(Core.pacote(st,aluno,{plano:{nome:"Consultoria mensal",valor:400},contrato:{inicio:"2026-09-09"}}).v!==pacote.v,"alterar uma pergunta exige nova versão");
  eq(Core.pacote(fixtureState(),{...aluno,onboardingConsultoria:{requerido:false}},{}),null,"personal pode dispensar um aluno");
  const inactive=fixtureState();inactive.config.onboardingConsultoria.ativo=false;
  eq(Core.pacote(inactive,aluno,{}),null,"personal pode desligar o onboarding inteiro");
  ok(Core.cpfValido("529.982.247-25")&&!Core.cpfValido("111.111.111-11"),"CPF válido é conferido e sequência repetida é recusada");
  const doc=Core.resolveContrato(Core.CONTRATO_PADRAO,{nome:"Alex Silva",nacionalidade:"Brasileiro",estadoCivil:"solteiro",profissao:"designer",rg:"MG-123",rgOrgao:"SSP/MG",cpf:"529.982.247-25",nascimento:"20/05/1990",email:"alex@teste.invalid",telefone:"(31) 99999-0000",cep:"30110-000",logradouro:"Rua Teste",numero:"20",bairro:"Centro",cidade:"Belo Horizonte",uf:"MG"},pacote);
  ok(!doc.includes("{{")&&doc.includes("Alex Silva")&&doc.includes("designer")&&doc.includes("Studio Teste"),"contrato resolve a qualificação completa das partes");
  ok(/ptonbconsult:\s*"\s*\+\s*escopo/.test(Core.runtime.toString()),"estado local é separado por token do aluno");
  return {st,aluno,pacote};
}

async function testStudent(f) {
  global.MT_CLOUD={url:FAKE,anonKey:"public-test-key"};
  require("../app/aluno-skin.js");require("../app/aluno-builder.js");
  const D={a:f.aluno,studio:"Studio Teste",cfg:{},fichasApp:[],guiaFichasP:[],fexs:[],sessApp:[],wodsApp:[],cardiosApp:[],onboardingApp:f.pacote,atualizador:""};
  const html=global.MT_APP_ALUNO.monta(D);
  const noGate=global.MT_APP_ALUNO.monta({...D,a:{...f.aluno,appTokenP:"token-sem-onboarding"},onboardingApp:null});
  ok(!noGate.includes("app_consultoria_estado"),"aluno dispensado recebe o app sem o bloqueio");
  const ctx=await browser.newContext({viewport:{width:390,height:844},locale:"pt-BR",timezoneId:"America/Sao_Paulo",serviceWorkers:"block"});
  const page=await ctx.newPage(),calls=[],errors=[];let accepted=null, reply="reject";
  page.on("pageerror",e=>errors.push(e.message));
  await ctx.addInitScript(()=>{localStorage.setItem("pttour",JSON.stringify({feito:true}));localStorage.setItem("ptonb",JSON.stringify({feito:true}));});
  await ctx.route("**/*",async route=>{
    const u=new URL(route.request().url());
    if(u.origin===new URL(BASE).origin){
      if(u.pathname==="/onboarding-consultoria-test.html")return route.fulfill({contentType:"text/html",body:html});
      return route.continue();
    }
    if(u.origin!==FAKE)return route.abort();
    const fn=u.pathname.split("/").pop(),body=route.request().postDataJSON();calls.push({fn,body});
    if(fn==="app_consultoria_estado")return route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true,concluido:false})});
    if(fn==="app_consultoria_conclui"){
      if(reply==="offline")return route.abort();
      if(reply==="reject")return route.fulfill({contentType:"application/json",body:JSON.stringify({ok:false,erro:"documento_divergente"})});
      accepted=body;return route.fulfill({contentType:"application/json",body:JSON.stringify({ok:true,id:"aceite-ficticio",aceito_em:"2026-09-09T15:00:00Z",documento_hash:"a".repeat(64)})});
    }
    return route.fulfill({contentType:"application/json",body:"null"});
  });
  await page.goto(BASE+"/onboarding-consultoria-test.html");
  await page.locator("#ocOverlay").waitFor();
  ok(await page.getByText("Vamos preparar sua consultoria").isVisible(),"aluno vê a explicação antes das perguntas");
  await page.locator("#ocProx").click();
  await page.locator("#ocTexto").fill("Ganhar força e melhorar minha rotina");await page.locator("#ocProx").click();
  await page.locator('[data-nota="7"]').click();await page.locator("#ocProx").click();
  await page.locator("#ocTexto").fill("Sem dor e sem medicamentos em uso");await page.locator("#ocProx").click();
  ok(await page.getByText("Confira seus dados").isVisible(),"contrato começa pela conferência dos dados");
  const data={ocNome:"Alex Silva",ocNacionalidade:"Brasileiro",ocEstadoCivil:"solteiro",ocProfissao:"designer",ocRg:"MG-12.345.678",ocRgOrgao:"SSP/MG",ocCpf:"529.982.247-25",ocNasc:"1990-05-20",ocEmail:"alex@teste.invalid",ocTelefone:"(31) 99999-0000",ocCep:"30110-000",ocRua:"Rua Teste",ocNumero:"20",ocBairro:"Centro",ocCidade:"Belo Horizonte",ocUf:"MG"};
  for(const [id,value] of Object.entries(data))await page.locator("#"+id).fill(value);
  await page.locator("#ocProx").click();
  ok((await page.locator("#ocDocumento").innerText()).includes("designer"),"documento mostrado já contém os dados conferidos");
  const documentoVisto=await page.locator("#ocDocumento").textContent();
  await page.locator("#ocLgpd").check();await page.locator("#ocAceite").check();await page.locator("#ocProx").click();
  await page.locator("#ocAssNome").fill("Alex Silva");
  const box=await page.locator("#ocCanvas").boundingBox();
  await page.mouse.move(box.x+30,box.y+75);await page.mouse.down();await page.mouse.move(box.x+120,box.y+45,{steps:5});await page.mouse.move(box.x+220,box.y+95,{steps:5});await page.mouse.up();
  await page.locator("#ocVolta").click();await page.locator("#ocLgpd").check();await page.locator("#ocAceite").check();await page.locator("#ocProx").click();
  await page.waitForTimeout(80);await page.locator("#ocProx").click();
  await page.waitForFunction(()=>document.getElementById('ocErro').textContent.includes('atualizado'));
  ok(await page.locator('#ocOverlay').isVisible()&&!await page.locator('#ocEntrar').count(),'rejeição do servidor não libera o app');
  reply='offline';await page.locator('#ocProx').click();
  await page.waitForFunction(()=>document.getElementById('ocErro').textContent.includes('Sem conexão'));
  ok(await page.evaluate(()=>window.__onboardingConsultoria.pendente()),'falha de rede mantém o preenchimento para reenvio');
  reply='success';await page.locator('#ocProx').click();
  await page.getByText("Cadastro concluído").waitFor();
  eq(accepted.p_assinatura.documento,documentoVisto,'texto enviado é exatamente o contrato exibido');
  ok((await page.locator('#ocEntrar').boundingBox()).height<100,'ação final permanece compacta');
  ok(!!accepted,"aceite foi enviado à RPC dedicada");
  eq(accepted.t,"token-onboarding-aluno-a","RPC usa somente o token deste aluno");
  eq(accepted.p_respostas.map(x=>x.id),["oq1","oq2","oq3"],"servidor recebe exatamente as perguntas publicadas");
  ok(accepted.p_dados.nome==="Alex Silva"&&accepted.p_dados.profissao==="designer"&&accepted.p_dados.logradouro==="Rua Teste","dados essenciais da parte contratante são enviados");
  ok(accepted.p_assinatura.aceitou&&accepted.p_assinatura.consentimentoSaude&&accepted.p_assinatura.imagem.startsWith("data:image/png;base64,"),"aceite, consentimento destacado e assinatura acompanham a versão");
  eq(accepted.p_versao,f.pacote.v,"aceite fica ligado à versão mostrada");
  ok(calls.filter(x=>x.fn==="app_consultoria_conclui").length===3,"cada tentativa gera somente um envio");
  for(const width of [320,360,390,430]){await page.setViewportSize({width,height:844});ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),"onboarding sem rolagem horizontal em "+width+"px");}
  if(process.env.ONBOARDING_SHOTS){await page.screenshot({path:path.join(process.env.ONBOARDING_SHOTS,"onboarding-concluido.png"),fullPage:true});}
  await page.locator("#ocEntrar").click();ok(await page.locator("#ocOverlay").count()===0,"app é liberado depois da conclusão");
  ok(errors.length===0,"fluxo não gera erro JavaScript: "+errors.join("; "));
  await ctx.close();
}

(async()=>{
  const f=testCore();
  // O token não entra na versão do documento, mas sempre separa armazenamento e transporte.
  f.aluno.appTokenP="token-onboarding-aluno-a";
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:["--no-sandbox"]});
  await testStudent(f);
  console.log(checks+" verificações do onboarding passaram.");
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
