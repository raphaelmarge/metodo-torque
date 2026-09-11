/* Regressão: Trocas aprovadas não pode comprimir o alimento em uma coluna de letras. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let chromium;try{chromium=require('playwright').chromium;}catch(_){chromium=require('/opt/node22/lib/node_modules/playwright').chromium;}
const {comMockNuvem}=require('./_nuvem');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;function ok(value,label){assert.ok(value,label);checks++;console.log('OK '+label);}
(async()=>{
 browser=comMockNuvem(await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}));
 const context=await browser.newContext({viewport:{width:1129,height:855},locale:'pt-BR',serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(BASE).origin&&r.request().method()==='GET'?r.continue():r.abort());
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(BASE+'/demo-personal.html');await page.locator('#btnDemo').click();await page.waitForURL(/personal\.html/);await page.waitForFunction(()=>window.MT_PERSONAL_NUTRICAO&&window.__renderPT);
 await page.evaluate(()=>{
  const S=MTStore,st=S.read('ptStudio',{}),item={id:'iogurte',nome:'Iogurte natural integral',porcao:'1 pote (170 g)',qtd:1,k:105,pt:6,cb:8,g:5,fonte:'Catálogo sintético',substituicoes:[{id:'alternativa',nome:'Iogurte natural sem lactose',porcao:'1 pote (170 g)',qtd:1,k:105,pt:6,cb:8,g:5}]};
  st.alunos=[{id:'layout-nutri',nome:'Aluno sintético do teste de layout',ativo:true}];
  st.nutricaoV1={planos:{'layout-nutri':{v:1,id:'plano-layout',ativo:true,titulo:'Plano sintético',atualizadoEm:'2026-09-11T12:00:00.000Z',refeicoes:[{id:'cafe',titulo:'Café da manhã',hora:'07:30',itens:[item,{...item,id:'segundo',nome:'Banana prata',substituicoes:[]}]}]}},alimentos:[],favoritos:[]};
  st.sessoes=[];st.pagamentos=[];st.contratosPT=[];st.agFixas=[];st.config={...st.config,dia1Off:true,zapFilaOff:true};S.write('ptStudio',st);__renderPT();
  document.querySelector('#abas [data-a="nutricao"]').click();
 });
 await page.locator('#pnAluno').selectOption('layout-nutri');await page.locator('#pnEditar').click();
 const row=page.locator('#pnRefeicoes .pn-items > .pn-food-row').first();
 async function geometry(){return row.evaluate(e=>{
  const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,right:r.right};},name=e.querySelector(':scope > div'),title=name.querySelector('b');
  return {row:box(e),name:box(name),title:box(title),lineHeight:parseFloat(getComputedStyle(title).lineHeight)||parseFloat(getComputedStyle(title).fontSize)*1.3,quantity:box(e.querySelector(':scope > .pn-qty')),remove:box(e.querySelector(':scope > button')),alternatives:box(e.querySelector(':scope > .pn-substitutions')),wrap:getComputedStyle(e).flexWrap};
 });}
 await row.scrollIntoViewIfNeeded();console.log('Geometria inicial em 1129 px: '+JSON.stringify(await geometry()));
 if(process.env.PN_LAYOUT_SHOTS){fs.mkdirSync(process.env.PN_LAYOUT_SHOTS,{recursive:true});await page.screenshot({path:path.join(process.env.PN_LAYOUT_SHOTS,'nutricao-editor-inicial.png')});}
 for(const theme of ['escuro','claro'])for(const width of [1129,1280,900,801,800,701,700,390,320]){
  await page.setViewportSize({width,height:855});await page.evaluate(t=>document.documentElement.dataset.tema=t,theme);await row.scrollIntoViewIfNeeded();
  const g=await geometry(),label=width+' px '+theme;
  ok(g.name.width>=Math.min(180,g.row.width*.6),'Nome tem espaço de leitura em '+label+' (largura '+g.name.width.toFixed(1)+' px)');
  ok(g.title.height<=g.lineHeight*3+1,'Nome ocupa no máximo três linhas em '+label);
  ok(g.alternatives.y>=Math.max(g.name.bottom,g.quantity.bottom,g.remove.bottom)-1,'Trocas aprovadas ficam após alimento e controles em '+label);
  ok(g.alternatives.width>=g.row.width-1,'Trocas aprovadas usam a largura da linha em '+label);
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Página sem rolagem horizontal em '+label);
  if(process.env.PN_LAYOUT_SHOTS&&[1129,320].includes(width))await page.screenshot({path:path.join(process.env.PN_LAYOUT_SHOTS,'nutricao-editor-'+width+'-'+theme+'.png')});
 }
 await row.locator(':scope > .pn-substitutions > summary').click();ok(await row.locator('[data-pnsubq]').isVisible(),'Alternativas continuam expansíveis');
 await row.locator('[data-pnqref]').fill('2');await row.locator('[data-pnqref]').dispatchEvent('input');
 const draft=await page.evaluate(()=>{const key=Object.keys(localStorage).find(k=>k.startsWith('ptNutriDraft:v814:')&&k.endsWith(':layout-nutri'));return JSON.parse(localStorage.getItem(key)).plano;});
 ok(draft.refeicoes[0].itens[0].qtd==='2','Controle de porções continua atualizando o rascunho');
 ok(await row.locator('[data-pnrmitem]').isVisible(),'Ação de remover alimento continua disponível');
 ok(await page.locator('[data-pnfood="0"]').isVisible(),'Ação de adicionar alimento continua disponível');
 const saved=await page.evaluate(()=>MTStore.read('ptStudio',{}).nutricaoV1.planos['layout-nutri']);ok(saved.refeicoes[0].itens[0].qtd===1,'Edição visual não modifica o plano aplicado');
 ok(errors.length===0,'Sem erros JavaScript: '+errors.join('; '));console.log(checks+' verificações do layout de refeições passaram.');await context.close();
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
