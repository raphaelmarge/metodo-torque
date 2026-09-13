/* IndexedDB real + interface de conflito; contas fictícias, nenhuma chamada ao Supabase. */
const assert=require('node:assert/strict');
const {chromium}=require('/opt/node22/lib/node_modules/playwright');
const BASE=process.env.BASE_URL||'http://127.0.0.1:8765';
let browser,checks=0;
function ok(value,message){assert.ok(value,message);checks++;console.log('OK '+message);}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/opt/pw-browsers/chromium',args:['--no-sandbox']});
 for(const width of [390,1280]){
  const context=await browser.newContext({viewport:{width,height:844},locale:'pt-BR',serviceWorkers:'block'});
  await context.route('**://*.supabase.co/**',route=>route.abort());
  await context.route(BASE+'/__sync-mobile-test',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Teste de recuperação</title><body><main>Painel de teste</main><script src="/apps/store.js"></script></body></html>'}));
  await context.addInitScript(()=>{
   const K='mtapp:ptStudio';
   if(!localStorage.getItem('teste-recuperacao-semeado')){
    localStorage.setItem(K,JSON.stringify({alunos:[{id:'local-ficticio'}],treinosV2:{},questionarios:[]}));
    localStorage.setItem('mtsync:ts',JSON.stringify({[K]:'2026-09-12T13:00:00.000Z'}));
    localStorage.setItem('teste-recuperacao-semeado','1');
   }
   const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(k,v){if(k.startsWith('mtsync:conflito:'))throw new DOMException('Cota cheia no teste','QuotaExceededError');return set.call(this,k,v);};
   window.__syncTestCalls=[];
   window.MT_CLOUD={url:'https://isolado.invalid',anonKey:'ficticio'};
   const client={auth:{getSession:async()=>({data:{session:{user:{id:'user-a',email:'a@example.invalid'}}}}),onAuthStateChange(){}},
    from(table){const query={select(){return this;},eq(){return this;},gt(){return this;},then(yes,no){
     window.__syncTestCalls.push(table);return Promise.resolve({data:table==='membros'?[{academia_id:'academy-a',papel:'funcionario',academias:{nome:'Equipe fictícia'}}]:
      [{chave:K,atualizado:'2026-09-13T14:00:00+00:00',valor:{alunos:[{id:'local-ficticio'},{id:'novo-PC-ficticio'}],treinosV2:{},questionarios:[]}}]}).then(yes,no);
    }};return query;},rpc(name){window.__syncTestCalls.push(name);return Promise.resolve({data:[]});}};
   window.supabase={createClient:()=>client};
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/__sync-mobile-test');await page.evaluate(()=>MTStore.iniciaSync());
  ok(await page.evaluate(()=>document.characterSet==='UTF-8'),width+': fixture usa UTF-8 como o Personal real');
  await page.locator('#mtSyncConflito').waitFor();
  ok((await page.locator('#mtSyncConflito').innerText()).includes('Preserve uma cópia'),width+': reproduz a falta de espaço do print');
  await page.getByRole('button',{name:'Carregar versão da nuvem',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('mtSyncConflito')&&MTStore.read('ptStudio').alunos.length===2);
  ok(await page.evaluate(()=>MTStore.read('ptStudio').alunos.some(a=>a.id==='novo-PC-ficticio')),width+': aluno do PC chegou sem apagar a base remota');
  ok(await page.evaluate(()=>!__syncTestCalls.includes('dados_cas')),width+': recuperação não escreve o painel antigo na nuvem');
  const readBackups=()=>page.evaluate(()=>new Promise((resolve,reject)=>{
   const request=indexedDB.open('mt-sync-rascunhos',1);request.onerror=()=>reject(request.error);request.onsuccess=()=>{
    const db=request.result,tx=db.transaction('rascunhos','readonly'),q=tx.objectStore('rascunhos').getAll();let rows;
    q.onsuccess=()=>rows=q.result;tx.oncomplete=()=>{db.close();resolve(rows);};tx.onabort=()=>reject(tx.error);
   };
  }));
  const copies=await readBackups();ok(copies.some(v=>JSON.parse(JSON.parse(v).raw).alunos.length===1),width+': rascunho anterior persistiu em transação real');
  await page.reload();await page.evaluate(()=>MTStore.iniciaSync());await page.waitForFunction(()=>MTStore.cloud());
  ok((await readBackups()).length===copies.length,width+': cópia continua disponível após recarregar');
  ok(await page.evaluate(()=>MTStore.read('ptStudio').alunos.length===2),width+': painel atualizado persiste após recarregar');
  ok(errors.length===0,width+': sem exceções JavaScript: '+errors.join('; '));
  await context.close();
 }
 console.log(checks+' verificações de recuperação no navegador passaram.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
