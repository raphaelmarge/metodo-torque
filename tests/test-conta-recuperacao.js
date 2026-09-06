/* Fluxos de autenticação sem navegador, rede, e-mails ou usuários reais. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../assets/modulo-conta.js'),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
async function setup(opts={}){
  const nodes={},calls=[],memory=new Map(Object.entries(opts.local||{}).map(([k,v])=>[k,JSON.stringify(v)])),events={};
  const el=id=>nodes[id]||(nodes[id]={id,style:{cssText:''},value:'',hidden:false,disabled:false,textContent:'',innerHTML:'',events:{},focus(){},setAttribute(){},addEventListener(n,f){this.events[n]=f;}});
  const sb={auth:{getSession:async()=>({data:{session:opts.session||null}}),onAuthStateChange:f=>events.auth=f,
    resetPasswordForEmail:async(email,options)=>{calls.push({op:'reset',email,options});if(opts.offline)throw Error('offline');return opts.resetError?{error:{message:'too many'}}:{data:{}}},
    updateUser:async body=>{calls.push({op:'password',body});return opts.expired?{error:{message:'expired'}}:{data:{user:{id:'user-test'}}}},
    signOut:async body=>{calls.push({op:'signOut',body});return{}},
    signInWithPassword:async()=>{if(opts.offline)throw Error('offline');return {data:{user:{id:'user-test',email:'teste@example.invalid'}}}},
    signUp:async()=>{if(opts.offline)throw Error('offline');return {data:{}}}},
    from:table=>({select(){return this},eq(key,value){calls.push({op:'filter',table,key,value});return this},then(ok,bad){return Promise.resolve(opts.memberError?{error:{message:'offline'}}:{data:opts.members||[{academia_id:'academy-test',papel:'funcionario',nome:'Fictício',academias:{nome:'Teste'}}]}).then(ok,bad)}}),
    rpc:async name=>{calls.push({op:'rpc',name});return{data:{}}}};
  const ctx={self:null,window:null,location:{origin:'https://teste.invalid',pathname:'/personal.html',hash:opts.hash||''},document:{createElement:()=>el('gateModulo'),body:{appendChild(){}},getElementById:el},
    localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)},MT_CLOUD:{url:'https://isolado.invalid',anonKey:'fake-public'},MT_supabase:sb,console,addEventListener(n,f){(events[n]||=[]).push(f)}};
  ctx.self=ctx;ctx.window=ctx;vm.createContext(ctx);vm.runInContext(code,ctx);ctx.MT_moduloConta({marca:'PERSONAL',fundo:'#000',cardBg:'#111',borda:'#333',grad:'#7344ee',corTag:'#eee',flag:'teste'});await tick();
  return {nodes,calls,memory,events,el,emit:n=>(events[n]||[]).forEach(f=>f()),submit:async()=>{el('mgForm').events.submit({preventDefault(){}});await tick();await tick()},click:async id=>{el(id).events.click();await tick()}};
}
let n=0;async function test(name,fn){await fn();n++;console.log('  ✅ '+name)}
(async()=>{
  await test('Recuperação envia só o e-mail e volta à página do Personal',async()=>{const x=await setup();await x.click('mgEsqueci');x.el('mgEmail').value='teste@example.invalid';assert.equal(x.el('mgSenha').required,false);await x.submit();assert.equal(x.calls[0].op,'reset');assert.equal(x.calls[0].options.redirectTo,'https://teste.invalid/personal.html');assert.match(x.el('mgErro').innerHTML,/Se este e-mail estiver cadastrado/);assert.equal(x.el('mgBtn').disabled,false)});
  await test('Sem rede permite tentar novamente sem prometer envio',async()=>{const x=await setup({offline:true});await x.click('mgEsqueci');await x.submit();assert.match(x.el('mgErro').innerHTML,/Sem conexão/);assert.equal(x.el('mgBtn').disabled,false)});
  await test('Link válido pede confirmação e não altera senha divergente',async()=>{const x=await setup();x.events.auth('PASSWORD_RECOVERY');x.el('mgSenha').value='senha-forte-ficticia';x.el('mgSenha2').value='diferente';await x.submit();assert.equal(x.calls.length,0);assert.equal(x.el('mgSenha2').hidden,false)});
  await test('Senha confirmada é atualizada e encerra sessões',async()=>{const x=await setup();x.events.auth('PASSWORD_RECOVERY');x.el('mgSenha').value=x.el('mgSenha2').value='senha-forte-ficticia';await x.submit();assert.equal(x.calls[0].op,'password');assert.equal(x.calls[1].op,'signOut');assert.equal(x.calls[1].body.scope,'global');assert.equal(x.el('mgSenha').value,'');assert.match(x.el('mgErro').innerHTML,/Senha atualizada/)});
  await test('Link expirado não indica sucesso nem encerra sessão por engano',async()=>{const x=await setup({expired:true});x.events.auth('PASSWORD_RECOVERY');x.el('mgSenha').value=x.el('mgSenha2').value='senha-forte-ficticia';await x.submit();assert.equal(x.calls.length,1);assert.match(x.el('mgErro').innerHTML,/expirado/)});
  await test('Fragmento de recuperação sem sessão pede outro link',async()=>{const x=await setup({hash:'#type=recovery'});assert.match(x.el('mgErro').innerHTML,/expirou ou é inválido/);assert.equal(x.el('mgSenha2').hidden,true)});
  await test('Entrada lê o papel somente do usuário autenticado',async()=>{const x=await setup();await x.submit();assert.ok(x.calls.some(c=>c.op==='filter'&&c.key==='user_id'&&c.value==='user-test'));const a=JSON.parse(x.memory.get('mtapp:academia'));assert.equal(a.papel,'funcionario');assert.equal(a.user_id,'user-test')});
  await test('Erro ao consultar vínculo não cria uma academia vazia',async()=>{const x=await setup({memberError:true});await x.submit();assert.ok(!x.calls.some(c=>c.op==='rpc'));assert.match(x.el('mgErro').innerHTML,/verificar seu acesso/)});
  await test('Entrar em outra conta não substitui o perfil nem abre dados anteriores',async()=>{const x=await setup({local:{'mtsync:identidade':{user_id:'outra-pessoa'},'mtapp:perfil':{nome:'Anterior',email:'anterior@example.invalid',nuvem:true}}});await x.submit();assert.equal(x.calls.length,0);assert.equal(JSON.parse(x.memory.get('mtapp:perfil')).nome,'Anterior');assert.equal(x.el('gateModulo').hidden,false);assert.match(x.el('mgErro').innerHTML,/outra conta/)});
  await test('Vínculo revogado não cria outra academia para receber os dados antigos',async()=>{const x=await setup({members:[],local:{'mtsync:identidade':{user_id:'user-test',academia_id:'academy-test'}}});await x.submit();assert.ok(!x.calls.some(c=>c.op==='rpc'));assert.equal(x.el('gateModulo').hidden,false);assert.match(x.el('mgErro').innerHTML,/vínculo/)});
  await test('Entrada e cadastro recuperam botão após falha de rede',async()=>{const x=await setup({offline:true});await x.submit();assert.equal(x.el('mgBtn').disabled,false);await x.click('mgAbaCriar');await x.submit();assert.equal(x.el('mgBtn').disabled,false)});
  await test('Modo local sem conta não fica bloqueado por aviso de sessão inexistente',async()=>{const x=await setup({local:{teste:'1'}});assert.equal(x.el('gateModulo').hidden,true);x.emit('mt:sessao-caiu');assert.equal(x.el('gateModulo').hidden,true)});
  await test('Conta autenticada volta ao login quando a sessão termina',async()=>{const x=await setup({session:{user:{id:'user-test',email:'teste@example.invalid'}}});assert.equal(x.el('gateModulo').hidden,true);x.emit('mt:sessao-caiu');assert.equal(x.el('gateModulo').hidden,false);assert.match(x.el('mgErro').innerHTML,/sessão terminou/)});
  console.log(n+' cenários de autenticação passaram.');
})().catch(e=>{console.error(e);process.exitCode=1});
