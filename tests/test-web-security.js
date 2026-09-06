/* Contratos de autorização e exclusão. Rede e contas são inteiramente fictícias. */
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const { stripTypeScriptTypes } = require('node:module');
const root = require('node:path').resolve(__dirname, '..');
let passed = 0;
async function test(name, run) { await run(); passed++; console.log('  ✅ ' + name); }
function removal(response) {
  const calls=[], memory=new Map([['mtapp:ptStudio','{"alunos":[1]}'],['mtsync:bak:mtapp:ptStudio','private'],['mtpf:caixa','private'],['outro-aplicativo','preservar']]);
  const context={self:null, confirm:()=>true, prompt:()=> 'EXCLUIR', alert:()=>{}, dispatchEvent:()=>{}, Event, console,
    localStorage:{getItem:k=>memory.get(k),removeItem:k=>memory.delete(k),key:i=>[...memory.keys()][i],get length(){return memory.size;}}};
  context.self=context;vm.runInNewContext(fs.readFileSync(root+'/assets/excluir-conta.js','utf8'),context);
  return {calls,memory,run:()=>context.MT_EXCLUIR.exclui({sb:{rpc:async(name)=>{calls.push(name);return response;},auth:{signOut:async()=>{calls.push('signOut');}}}})};
}
(async()=>{
  await test('Excluir colaborador ou dono compartilhado não revoga os alunos da equipe',async()=>{
    const x=removal({data:{ok:true,ilhas_apagadas:0}});assert.equal((await x.run()).ok,true);
    assert.deepEqual(x.calls,['excluir_minha_conta','signOut']);assert.equal(x.memory.size,1);assert.equal(x.memory.get('outro-aplicativo'),'preservar');
  });
  await test('Falha do servidor conserva dados e sessão para tentar de novo',async()=>{
    const x=removal({error:{message:'sem conexão'}});await assert.rejects(x.run(),/sem conexão/);assert.equal(x.memory.size,4);assert.deepEqual(x.calls,['excluir_minha_conta']);
  });
  const fonte=stripTypeScriptTypes(fs.readFileSync(root+'/supabase/functions/pagamentos/index.ts','utf8'));
  let role='funcionario', calls=[],handler;
  const context={URL,Request,Response,console,encodeURIComponent,
    Deno:{env:{get:k=>({SUPABASE_URL:'https://isolado.invalid',SUPABASE_SERVICE_ROLE_KEY:'fake-service',SUPABASE_ANON_KEY:'fake-anon'}[k]||'')},serve:f=>handler=f},
    fetch:async(url)=>{calls.push(url);const u=new URL(url);
      if(u.pathname==='/auth/v1/user')return Response.json({id:'test-user',email:'teste@example.invalid'});
      if(u.pathname==='/rest/v1/membros')return Response.json(u.searchParams.get('papel')==='eq.'+role?[{academia_id:'test-academy'}]:[]);
      if(u.pathname==='/rest/v1/pag_config')return Response.json([{provedor:'asaas',chave:'fake-gateway'}]);
      throw Error('Chamada não autorizada no teste: '+url);
    }};
  vm.runInNewContext(fonte+'\nglobalThis.testConfigDe=configDe;',context);
  await test('Colaborador não acessa credenciais financeiras nem gera cobrança',async()=>{
    assert.equal(await context.testConfigDe('test-user'),null);assert.ok(!calls.some(u=>u.includes('/pag_config')));
    const r=await handler(new Request('https://isolado.invalid/',{method:'POST',headers:{Authorization:'Bearer fake-user','Content-Type':'application/json'},body:JSON.stringify({acao:'link',valor:50})}));
    assert.ok(r.status>=400);assert.ok(calls.every(u=>u.startsWith('https://isolado.invalid/')));
  });
  await test('Dono continua alcançando a configuração da própria academia',async()=>{
    role='dono';calls=[];const r=await context.testConfigDe('test-user');assert.equal(r.aid,'test-academy');assert.equal(r.provedor,'asaas');assert.ok(calls[1].includes('academia_id=eq.test-academy'));
  });
  console.log(passed+' cenários passaram; nenhum serviço externo foi chamado.');
})().catch(e=>{console.error(e);process.exitCode=1;});
