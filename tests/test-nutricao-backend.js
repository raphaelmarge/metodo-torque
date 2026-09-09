/* Nutrição: fronteiras reais da Edge Function com transporte/credenciais inteiramente simulados. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const src = fs.readFileSync(path.join(__dirname,"../supabase/functions/chat-envia/index.ts"),"utf8");
const IMAGE="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC";
const ITEM={nome:"Arroz cozido",porcao:"100 g",qtd:1.3,k:130,pt:2.5,cb:28,g:0.2};
let count=0;
function check(name,fn){fn();count++;console.log("OK "+name);}
function app(options={}){
 let handler,calls=[];
 const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});
 const ctx={Request,Response,Headers,AbortController,setTimeout,clearTimeout,atob,console:{error(){}},Deno:{env:{get:k=>({SUPABASE_SERVICE_ROLE_KEY:"server-only",SUPABASE_ANON_KEY:"public-key",SUPABASE_URL:"https://fixture.invalid",ANTHROPIC_API_KEY:options.noKey?"":"fake-key"}[k]||"")},serve:h=>handler=h},
  fetch:async(url,init={})=>{
   calls.push({url:String(url),init});const u=String(url);
   if(u.endsWith("/auth/v1/user"))return response(options.member?{id:"member"}:{},options.member?200:401);
   if(u.includes("/rest/v1/app_aluno?"))return response(options.revoked?[]:[{academia_id:"academy-A",dados:{dados:{nutricaoApp:{ativo:!options.disabled}}}}],options.accessFailure?503:200);
   if(u.includes("/rest/v1/membros?"))return response(options.member?[{academia_id:"academy-A"}]:[]);
   if(u.includes("/rpc/ia_uso_conta"))return response({ok:!options.quota,n:81,teto:80},options.quotaFailure?503:200);
   if(u==="https://api.anthropic.com/v1/messages")return response(options.anthropicBody||{content:[{type:"text",text:JSON.stringify({itens:[ITEM],observacao:"Confira a porção."})}]},options.anthropicStatus||200);
   throw Error("Unexpected request "+u);
  }};
 vm.createContext(ctx);vm.runInContext(stripTypeScriptTypes(src),ctx);
 return {ctx,calls,async run(body,auth="public-key"){return handler(new Request("https://fixture.invalid/functions/v1/chat-envia",{method:"POST",headers:{"content-type":"application/json",authorization:"Bearer "+auth},body:JSON.stringify(body)}));}};
}
(async()=>{
 let a=app();
 check("imagem válida reconhecida",()=>assert.equal(a.ctx.leImagemPrato(IMAGE).media_type,"image/png"));
 for(const bad of ["",IMAGE+"!",IMAGE.replace("image/png","image/svg+xml"),"https://example.com/photo.png",IMAGE.repeat(10000)]){
   check("imagem inválida recusada",()=>assert.equal(a.ctx.leImagemPrato(bad),null));
 }
 check("resposta numérica íntegra",()=>assert.equal(a.ctx.lePratoIA(JSON.stringify({itens:[ITEM]})).itens[0].qtd,1.3));
 for(const item of [{...ITEM,k:-1},{...ITEM,qtd:0},{...ITEM,k:"130"},{...ITEM,porcao:""},{...ITEM,pt:Infinity}]){
   check("estimativa incompleta não vira alimento",()=>assert.equal(a.ctx.lePratoIA(JSON.stringify({itens:[item]})),null));
 }
 for(const scenario of [{name:"anônimo",opts:{},body:{acao:"ia_prato",imagem:IMAGE},status:401},
   {name:"token inválido",opts:{},body:{acao:"ia_prato",imagem:IMAGE,t:"x'},or=(1=1)"},status:403},
   {name:"acesso revogado",opts:{revoked:true},status:403},
   {name:"nutrição não habilitada",opts:{disabled:true},status:403},
   {name:"falha na consulta de acesso",opts:{accessFailure:true},status:503},
   {name:"chave ausente",opts:{noKey:true},status:503},
   {name:"quota atingida",opts:{quota:true},status:429},
   {name:"contador indisponível",opts:{quotaFailure:true},status:503}]){
   a=app(scenario.opts);const r=await a.run(scenario.body||{acao:"ia_prato",imagem:IMAGE,t:"student_token_A"});
   check(scenario.name+" bloqueia análise",()=>assert.equal(r.status,scenario.status));
   check(scenario.name+" não chama IA",()=>assert.equal(a.calls.some(c=>c.url.includes("anthropic.com")),false));
 }
 a=app();let r=await a.run({acao:"ia_prato",imagem:IMAGE,t:"student_token_A"}),body=await r.json();
 check("token vigente recebe estimativa",()=>{assert.equal(r.status,200);assert.equal(body.estimativa,true);assert.equal(body.itens[0].k,130);assert.equal(body.itens[0].qtd,1.3)});
 check("análise não grava diário nem publica feed",()=>assert.equal(a.calls.some(c=>c.url.includes("/app_aluno?")&&c.init.method&&c.init.method!=="GET"),false));
 check("quota usa academia do token",()=>assert.equal(JSON.parse(a.calls.find(c=>c.url.includes("ia_uso_conta")).init.body).p_academia,"academy-A"));
 check("imagem chega como bloco estruturado",()=>{let q=JSON.parse(a.calls.find(c=>c.url.includes("anthropic.com")).init.body);assert.equal(q.messages[0].content[0].source.type,"base64");assert.equal(q.messages[0].content[0].source.media_type,"image/png")});
 a=app({member:true});r=await a.run({acao:"ia_prato",imagem:IMAGE},"valid-member-token");
 check("profissional autenticado usa o mesmo serviço",()=>assert.equal(r.status,200));
 a=app({anthropicStatus:429});r=await a.run({acao:"ia_prato",imagem:IMAGE,t:"student_token_A"});
 check("falha do provedor não vira registro inventado",()=>assert.equal(r.status,502));
 a=app({anthropicBody:{content:[{type:"text",text:'{"itens":[],"observacao":"Não há comida identificável."}'}]}});r=await a.run({acao:"ia_prato",imagem:IMAGE,t:"student_token_A"});
 check("imagem sem comida pede revisão",()=>assert.equal(r.status,422));
 a=app();r=await a.run({acao:"ping"});body=await r.json();
 check("ping preserva operações anteriores e acrescenta foto",()=>assert.ok(["ia_treino","ia_dieta","ia_prato","enviar","sugerir"].every(x=>body.acoes.includes(x))));
 console.log(count+" verificações de nutrição/backend passaram.");
})().catch(e=>{console.error(e);process.exitCode=1});
