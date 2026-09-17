/* Demos reais, dados fictícios: não autentica, não cobra e não envia respostas. */
const assert=require('node:assert/strict');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
const GIF_HOST='hdcufkaalxfhwmfwoiqp.supabase.co';
const GIF_PREFIX='/storage/v1/object/public/exercicios/';
const GIF_1PX=Buffer.from('R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=','base64');
let b,n=0;
function ok(v,m){assert.ok(v,m);n++;console.log('OK '+m);}
(async()=>{
 b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox'].concat(process.env.CHROMIUM_ARGS_JSON?JSON.parse(process.env.CHROMIUM_ARGS_JSON):[])});
 for(const width of [390,1280]) for(const file of ['demo-aluno.html','demo-aluno-sem-cadastro.html','demo-aluno-cadastro.html']){
  const ctx=await b.newContext({viewport:{width,height:844},locale:'pt-BR',timezoneId:'America/Sao_Paulo',serviceWorkers:'block'});
  const external=[],errors=[];
  await ctx.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin===new URL(BASE).origin)return r.continue();external.push(u.origin+u.pathname);if(r.request().method()==='GET'&&u.hostname===GIF_HOST&&u.pathname.startsWith(GIF_PREFIX)&&/\.gif$/i.test(u.pathname))return r.fulfill({status:200,contentType:'image/gif',body:GIF_1PX});return r.abort();});
  await ctx.addInitScript(()=>{localStorage.setItem('mtapp:ptStudio','{"sentinela":"não alterar"}');});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/'+file);await p.waitForFunction(()=>typeof window.__trocaSec==='function'&&typeof window.__demoLS==='object');
  const label=width+' '+file,cadastro=file==='demo-aluno-cadastro.html';
  if(cadastro){
   await p.locator('#ocProx').waitFor();
   ok(await p.locator('#ocOverlay').isVisible(),label+': mostra o primeiro acesso');
   await p.locator('#ocProx').click();
   ok(await p.locator('#ocTexto').isVisible(),label+': questionário inicial continua funcionando');
  }else{
   ok(await p.locator('#ocOverlay').count()===0&&await p.locator('#ocPagar').count()===0,label+': entra sem questionário, contrato ou pagamento inicial');
   ok(await p.locator('#heroTopo').isVisible(),label+': abre diretamente no início');
   await p.evaluate(()=>window.__trocaSec('quest'));
   await p.locator('#qaBox').waitFor({state:'visible'});
   ok((await p.locator('#qaBox').innerText()).includes('Como você está?'),label+': acompanhamento continua disponível dentro do app');
   await p.evaluate(()=>window.__trocaSec('inicio'));
  }
  ok(await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio')==='{"sentinela":"não alterar"}'),label+': preserva o painel real do navegador');
  ok(await p.evaluate(()=>window.__demoOnboardingAceite===null),label+': não simula aceite nem cobrança concluída');
  ok(external.every(u=>u.startsWith('https://'+GIF_HOST+GIF_PREFIX)&&/\.gif$/i.test(u)),label+': rede externa limitada aos GIFs públicos: '+external.join(';'));
  ok(errors.length===0,label+': sem exceções: '+errors.join(';'));
  await ctx.close();
 }
 console.log(n+' verificações da entrada das demos passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(b)await b.close();});
