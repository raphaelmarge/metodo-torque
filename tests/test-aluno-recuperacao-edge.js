// Executa o handler real da Edge Function com rede e segredos fictícios.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/aluno-recupera/index.ts'),'utf8');
async function setup(opts={}){
 let handle;const calls=[],pending=[];
 const ctx={Request,Response,TextEncoder,AbortSignal,crypto:require('node:crypto').webcrypto,console:{error(){}},
 Deno:{env:{get:k=>({SUPABASE_URL:'https://isolado.invalid',SUPABASE_SERVICE_ROLE_KEY:'privado-ficticio',RESEND_API_KEY:opts.semChave?'':'email-ficticio',EMAIL_DE:'Torque <teste@example.invalid>'}[k])},serve:fn=>handle=fn},
 EdgeRuntime:{waitUntil:p=>pending.push(p)},fetch:async(url,args)=>{
  const body=JSON.parse(args.body);calls.push({url,body,headers:args.headers});
  if(url.includes('resend'))return new Response('{}',{status:opts.falhaEmail?500:200});
  if(opts.falhaBanco)return new Response('{}',{status:500});
  return new Response(JSON.stringify(url.endsWith('inicia')?(opts.inexistente?{}:{email:body.p_email}):{ok:!opts.expirado}));
 }};
 vm.runInNewContext(code,ctx);
 return {calls,async send(body){const r=await handle(new Request('https://edge.invalid',{method:'POST',body:JSON.stringify(body)}));await Promise.all(pending);return {status:r.status,body:await r.json()}}};
}
let n=0;const ok=(c,m)=>{assert.ok(c,m);console.log('OK '+m);n++};
(async()=>{
 const x=await setup();const yes=await x.send({acao:'solicitar',email:' A@example.invalid ',para:'vitima@example.invalid',html:'injetado'});
 ok(yes.status===200&&yes.body.ok,'pedido válido responde genericamente');
 ok(x.calls[0].body.p_email==='a@example.invalid'&&/^[a-f0-9]{64}$/.test(x.calls[0].body.p_hash),'normaliza login e só grava hash');
 const mail=x.calls[1].body;ok(mail.to[0]==='a@example.invalid'&&!mail.html.includes('injetado'),'destino/conteúdo não são controlados pelo pedido');
 const secret=mail.text.match(/#recuperar=([a-f0-9]{64})/)[1];
 ok(secret!==x.calls[0].body.p_hash&&!JSON.stringify(yes).includes(secret),'segredo aleatório não é o hash nem retorna ao visitante');
 ok(mail.text.includes('20 minutos')&&mail.html.includes('lang="pt-BR"'),'e-mail informa prazo e inclui versão texto');
 const no=await setup({inexistente:true}),nr=await no.send({acao:'solicitar',email:'inexistente@example.invalid'});
 ok(JSON.stringify(nr)===JSON.stringify(yes)&&no.calls.length===1,'conta ausente/limitada tem a mesma resposta e não envia');
 const fail=await setup({falhaEmail:true});ok(JSON.stringify(await fail.send({acao:'solicitar',email:'a@example.invalid'}))===JSON.stringify(yes),'falha do provedor não revela existência');
 const conf=await setup({semChave:true});ok((await conf.send({acao:'solicitar',email:'a@example.invalid'})).status===503&&conf.calls.length===0,'sem configuração não promete envio');
 const phone=await setup();ok((await phone.send({acao:'solicitar',email:'21999999999'})).status===400&&phone.calls.length===0,'celular não vira destinatário');
 const done=await x.send({acao:'concluir',segredo:secret,senha:'nova-senha-segura'});ok(done.body.ok&&!('token' in done.body),'troca não entrega token do app');
 const expired=await setup({expirado:true});ok((await expired.send({acao:'concluir',segredo:secret,senha:'nova-senha-segura'})).status===400,'link inválido/expirado recusado');
 const sql=await setup({falhaBanco:true});ok((await sql.send({acao:'solicitar',email:'a@example.invalid'})).status===503,'falha no banco não vira sucesso');
 console.log(n+' verificações da Edge Function aprovadas.');
})().catch(e=>{console.error(e);process.exitCode=1});
