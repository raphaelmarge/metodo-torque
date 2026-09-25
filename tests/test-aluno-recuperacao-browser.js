// Navegador real, requisições interceptadas e alunos fictícios. Não envia e-mail.
const assert=require('node:assert/strict');
const pw=require(process.env.TORQUE_PLAYWRIGHT||'/opt/node22/lib/node_modules/playwright');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
const engine=process.env.TORQUE_BROWSER||'chromium';
let n=0;const ok=(c,m)=>{assert.ok(c,m);console.log('OK '+m);n++};
(async()=>{
 const browser=await pw[engine].launch(engine==='chromium'?{executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']}:{});
 try{
 for(const width of [320,390,1280]){
  const ctx=await browser.newContext({viewport:{width,height:844},locale:'pt-BR',serviceWorkers:'block'});
  let mode='ok',requests=[];
  await ctx.route('**/*',async r=>{
   const url=r.request().url();if(url.startsWith(BASE))return r.continue();
   if(url.endsWith('/functions/v1/aluno-recupera')){
    requests.push(r.request().postDataJSON());
    if(mode==='offline')return r.abort();
    return r.fulfill({status:mode==='expired'?400:200,contentType:'application/json',body:JSON.stringify(mode==='expired'?{erro:'Este link expirou ou já foi usado. Solicite outro.'}:{ok:true,mensagem:'Se este e-mail estiver cadastrado como login, você receberá um link.'})});
   }
   return r.abort();
  });
  const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/aluno-login.html?sair=1');await page.click('#esqueci');
  ok(await page.locator('#recEmail').isVisible()&&!await page.locator('#frm').isVisible(),width+': recuperação acessível na entrada');
  if(width===390 && process.env.RUNNER_TEMP)await page.screenshot({path:require('node:path').join(process.env.RUNNER_TEMP,'torque-testes','recuperacao-aluno.png'),fullPage:true});
  await page.fill('#recEmail','aluno@example.invalid');await page.click('#recEnviar');
  await page.waitForFunction(()=>document.querySelector('#recStatus').textContent.includes('Se este e-mail'));
  ok(requests.length===1&&requests[0].acao==='solicitar'&&!('senha' in requests[0]),'pedido não envia senha');
  ok(await page.locator('#recEnviar').isDisabled(),'reenvio tem espera');
  await page.click('#recVoltar');ok(await page.locator('#frm').isVisible(),'volta ao login');
  await page.evaluate(()=>localStorage.setItem('mt_aluno_token','outro-aluno-ficticio'));
  await page.goto(BASE+'/aluno-login.html#recuperar='+'a'.repeat(64));
  ok(page.url()===BASE+'/aluno-login.html','segredo sai do endereço e sessão antiga não redireciona');
  await page.fill('#recSenha','nova-senha-segura');await page.fill('#recConfirma','senha-diferente');await page.click('#recEnviar');
  ok(requests.length===1&&(await page.locator('#recStatus').innerText()).includes('iguais'),'senhas divergentes não chamam servidor');
  await page.fill('#recConfirma','nova-senha-segura');await page.click('#recEnviar');
  await page.waitForFunction(()=>document.querySelector('#recStatus').textContent.includes('Senha atualizada'));
  ok(await page.locator('#recSenha').inputValue()===''&&!await page.locator('#recEnviar').isVisible(),'sucesso limpa senha e não reaplica');
  ok(await page.evaluate(()=>localStorage.getItem('mt_aluno_token'))==='outro-aluno-ficticio','recuperação não apaga dados de outra sessão');
  mode='expired';await page.goto(BASE+'/aluno-login.html#recuperar='+'b'.repeat(64));
  await page.fill('#recSenha','nova-senha-segura');await page.fill('#recConfirma','nova-senha-segura');await page.click('#recEnviar');
  await page.locator('#recNovo').waitFor({state:'visible'});await page.click('#recNovo');
  ok(await page.locator('#recEmail').isVisible(),'link expirado oferece nova solicitação');
  mode='offline';await page.fill('#recEmail','aluno@example.invalid');await page.click('#recEnviar');
  await page.waitForFunction(()=>document.querySelector('#recStatus').textContent.includes('Confira a conexão'));
  ok(!await page.locator('#recEnviar').isDisabled(),'falha permite tentar de novo sem falso sucesso');
  ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'sem rolagem horizontal em '+width);
  ok(errors.length===0,'sem erro de JavaScript em '+width);
  if(process.env.TORQUE_SCREENSHOT&&width===390)await page.screenshot({path:process.env.TORQUE_SCREENSHOT,fullPage:true});
  await ctx.close();
 }
 console.log(n+' verificações de recuperação no '+engine+' aprovadas.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
