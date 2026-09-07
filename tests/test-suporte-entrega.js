/* Registro durável e feedback do suporte, com rede substituída e dados fictícios. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {stripTypeScriptTypes}=require('node:module');
const root=require('node:path').resolve(__dirname,'..');
const edge=stripTypeScriptTypes(fs.readFileSync(root+'/supabase/functions/suporte/index.ts','utf8'));
const html=fs.readFileSync(root+'/personal.html','utf8');
const ui=html.slice(html.indexOf('  function renderAjudaChamado()'),html.indexOf('  window.__ajudaSup ='));
const tick=()=>new Promise(r=>setImmediate(r));
function server(opts={}) {
  let handler;const calls=[],saved=[];
  vm.runInNewContext(edge,{Request,Response,URL,Intl,Date,Uint8Array,crypto:require('node:crypto').webcrypto,console:{error(){}},
    Deno:{serve:f=>handler=f,env:{get:k=>({SUPABASE_URL:'https://isolado.invalid',SUPABASE_SERVICE_ROLE_KEY:'ficticio',SUPABASE_ANON_KEY:'anon-ficticio',RESEND_API_KEY:opts.noKey?'':'resend-ficticio',EMAIL_SUPORTE:'suporte@example.invalid',EMAIL_DE:'teste@example.invalid'}[k]||'')}},
    fetch:async(url,init={})=>{calls.push(url);const u=new URL(url);
      if(u.pathname==='/auth/v1/user')return Response.json(opts.invalid?{}:{id:'11111111-1111-4111-8111-111111111111'});
      if(u.pathname==='/rest/v1/membros')return Response.json(opts.foreign?[]:[{user_id:'11111111-1111-4111-8111-111111111111'}]);
      if(u.pathname==='/rest/v1/suporte_chamados'){if(opts.dbFail)return new Response('',{status:500});saved.push(JSON.parse(init.body));return new Response('',{status:201})}
      if(url==='https://api.resend.com/emails'){assert.equal(saved.length,1);if(opts.offline)throw Error('sem rede');return new Response('',{status:opts.mailFail?422:200})}
      throw Error('Chamada inesperada no teste: '+url);
    }});
  return {calls,saved,run:async()=>{const r=await handler(new Request('https://isolado.invalid/',{method:'POST',headers:{Authorization:'Bearer sessao-ficticia','Content-Type':'application/json'},body:JSON.stringify({acao:'abrir',aid:'22222222-2222-4222-8222-222222222222',tipo:'bug',msg:'Chamado inteiramente fictício.',email:'pessoa@example.invalid'})}));return {status:r.status,body:await r.json()}}};
}
function screen(opts={}) {
  const nodes={};const el=id=>nodes[id]||(nodes[id]={value:'',textContent:'',innerHTML:'',hidden:true,disabled:false,checkValidity(){return id!=='supEmail'||!this.value||/^[^\s@]+@[^\s@]+$/.test(this.value)},focus(){this.focused=true}});
  el('supMsg').value='Descrição do problema fictício';el('supTipo').value='bug';el('supEmail').value='pessoa@example.invalid';
  const q={select(){return this},eq(){return this},order(){return this},limit(){return this},then(ok,bad){return Promise.resolve(opts.listError?{error:{message:'offline'}}:{data:[]}).then(ok,bad)}};
  const ctx={$:el,esc:x=>x,document:{contains:x=>Object.values(nodes).includes(x)},S:{cloud:()=>({aid:'ficticio',client:{from:()=>q}})},MT_FUNCAO:{chama:async()=>{if(opts.offline)throw Error('offline');return{ok:true,protocolo:'TQ-TEST-ABCD',emailEnviado:!opts.mailFail}}}};
  vm.runInNewContext(ui,ctx);return {ctx,el};
}
let n=0;async function test(name,fn){await fn();n++;console.log('  ✅ '+name)}
(async()=>{
  for(const opts of [{mailFail:true},{offline:true},{noKey:true}])await test('Falha de aviso conserva protocolo e chamado '+JSON.stringify(opts),async()=>{const x=server(opts),r=await x.run();assert.equal(r.status,200);assert.equal(r.body.ok,true);assert.equal(r.body.emailEnviado,false);assert.equal(x.saved[0].protocolo,r.body.protocolo)});
  await test('E-mail aceito só depois de o chamado ser registrado',async()=>{const x=server(),r=await x.run();assert.equal(r.body.emailEnviado,true);assert.equal(x.saved.length,1)});
  await test('Falha ao registrar não indica sucesso nem tenta e-mail',async()=>{const x=server({dbFail:true}),r=await x.run();assert.equal(r.status,500);assert.ok(!x.calls.some(u=>u.includes('resend.com')))});
  for(const opts of [{invalid:true},{foreign:true}])await test('Identidade inválida ou outra equipe não cria chamado '+JSON.stringify(opts),async()=>{const x=server(opts),r=await x.run();assert.ok(r.status===401||r.status===403);assert.equal(x.saved.length,0);assert.ok(!x.calls.some(u=>u.includes('resend.com')))});
  await test('Painel mostra protocolo e falha do aviso sem prometer resposta por e-mail',async()=>{const x=screen({mailFail:true});x.ctx.enviaChamado();await tick();await tick();assert.equal(x.el('supProto').textContent,'TQ-TEST-ABCD');assert.equal(x.el('supOk').hidden,false);assert.match(x.el('supEntrega').textContent,/não foi enviado/);assert.equal(x.el('supEnvia').disabled,false)});
  await test('Erro na lista não informa que nenhum chamado existe',async()=>{const x=screen({listError:true});x.ctx.carregaChamados();await tick();assert.match(x.el('supLista').textContent,/Não deu pra carregar/)});
  await test('Falha de rede preserva descrição e permite nova tentativa',async()=>{const x=screen({offline:true});x.ctx.enviaChamado();await tick();await tick();assert.match(x.el('supMsg').value,/fictício/);assert.equal(x.el('supEnvia').disabled,false);assert.match(x.el('supStatus').textContent,/tente de novo/)});
  console.log(n+' cenários do suporte passaram sem mensagens reais.');
})().catch(e=>{console.error(e);process.exitCode=1});
