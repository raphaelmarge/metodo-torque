import {handler} from '../_shared/tecnica-handler.mjs';
import {cleanupAdapter} from '../_shared/tecnica-cleanup.mjs';
const base=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
const bucket='tecnica-privada';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store','Content-Type':'application/json'};
const conflict=()=>Object.assign(new Error('O registro mudou. Atualize a análise e tente novamente.'),{status:409});
async function api(path:string,init:RequestInit={}){
 const r=await fetch(base+path,{...init,headers:{...headers,...init.headers},signal:AbortSignal.timeout(15000)});
 if(!r.ok){let message='Não foi possível concluir a operação.',status=r.status===409?409:503;try{const error=await r.json();if(/^PT(?:400|404|409|429)$/.test(error.code)){status=Number(error.code.slice(2));message=error.message;}}catch(_){}throw Object.assign(new Error(message),{status});}
 return r.status===204?null:r.json();
}
const rows=(table:string,query:string)=>api('/rest/v1/'+table+'?'+query);
const eq=(s:unknown)=>encodeURIComponent(String(s));
const uploadPath=(p:string)=>p.split('/').map(encodeURIComponent).join('/');
const rpcRow=(value:any)=>{const row=Array.isArray(value)?value[0]:value;if(!row?.id)throw conflict();return row;};
const cleanup=cleanupAdapter(api);
async function active(token:string){return !!await api('/rest/v1/rpc/app_aluno_ativo',{method:'POST',body:JSON.stringify({t:token})});}
const db={
 async student(token:unknown){if(typeof token!=='string'||token.length<10||token.length>300)return null;const academia=await api('/rest/v1/rpc/app_aluno_ativo',{method:'POST',body:JSON.stringify({t:token})});return academia?{token,academia}:null;},
 async professional(auth:string,academia:string){
  if(!/^Bearer \S+$/.test(auth||'')||!academia)return null;
  const response=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return null;const u=await response.json();if(!u.id)return null;
  const m=await rows('membros','select=user_id&user_id=eq.'+eq(u.id)+'&academia_id=eq.'+eq(academia)+'&limit=1');
  return m.length?{user:u.id,academia}:null;
 },active,
 activeTokens(academia:string,tokens:string[]){return tokens.length?api('/rest/v1/rpc/tecnica_tokens_ativos',{method:'POST',body:JSON.stringify({p_academia:academia,p_tokens:tokens})}):Promise.resolve([]);},
 async list(who:any,token?:string){
  return rows('app_tecnica_revisoes','select=*&apagado_em=is.null&academia_id=eq.'+eq(who.academia)+(who.token||token?'&token=eq.'+eq(who.token||token):'&estado=neq.rascunho')+'&order=criado_em.desc&limit=100');
 },
 async review(id:string){return (await rows('app_tecnica_revisoes','select=*&id=eq.'+eq(id)+'&limit=1'))[0]||null;},
 async create(item:any){return rpcRow(await api('/rest/v1/rpc/tecnica_cria',{method:'POST',body:JSON.stringify({p_id:item.id,p_token:item.token,p_academia:item.academia_id,p_contexto:item.contexto})}));},
 async update(item:any,patch:any){const result=await api('/rest/v1/app_tecnica_revisoes?id=eq.'+eq(item.id)+'&academia_id=eq.'+eq(item.academia_id)+'&apagado_em=is.null&versao=eq.'+eq(item.versao),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({...patch,versao:item.versao+1,atualizado_em:new Date().toISOString()})});if(!result.length)throw conflict();return result[0];},
 files(id:string){return rows('app_tecnica_arquivos','select=*&revisao_id=eq.'+eq(id));},
 async prepareFile(item:any){return rpcRow(await api('/rest/v1/rpc/tecnica_prepara_arquivo',{method:'POST',body:JSON.stringify({p_id:item.id,p_revisao:item.revisao_id,p_academia:item.academia_id,p_tipo:item.tipo,p_mime:item.mime,p_bytes:item.bytes})}));},
 fileReady(id:string,review:string,academia:string){return api('/rest/v1/rpc/tecnica_arquivo_pronto',{method:'POST',body:JSON.stringify({p_id:id,p_revisao:review,p_academia:academia})});},
 async signUpload(path:string){const x=await api('/storage/v1/object/upload/sign/'+bucket+'/'+uploadPath(path),{method:'POST',body:'{}'});const relative=x.url||x.signedURL||x.signedUrl;if(!relative)throw Error('Upload indisponível.');return {uploadUrl:base+'/storage/v1'+relative};},
 async info(path:string){const r=await fetch(base+'/storage/v1/object/authenticated/'+bucket+'/'+uploadPath(path),{method:'HEAD',headers,signal:AbortSignal.timeout(10000)});return r.ok?{bytes:Number(r.headers.get('content-length')),mime:r.headers.get('content-type')||''}:null;},
 async signRead(path:string){const x=await api('/storage/v1/object/sign/'+bucket+'/'+uploadPath(path),{method:'POST',body:JSON.stringify({expiresIn:300})});return base+'/storage/v1'+(x.signedURL||x.signedUrl);},
 async removeFiles(paths:string[]){if(paths.length)await api('/storage/v1/object/'+bucket,{method:'DELETE',body:JSON.stringify({prefixes:paths})});},
 tombstone(id:string,academia:string){return api('/rest/v1/rpc/tecnica_apaga',{method:'POST',body:JSON.stringify({p_id:id,p_academia:academia})});},
 cleanup:(academia:string)=>cleanup({academia,limit:2,budgetMs:10000})
};
const execute=handler(db);
async function readBody(req:Request){
 const limit=65536;if(Number(req.headers.get('content-length'))>limit)throw Object.assign(Error('Pedido muito grande.'),{status:413});
 const reader=req.body?.getReader();if(!reader)throw Object.assign(Error('Pedido inválido.'),{status:400});
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw Object.assign(Error('Pedido muito grande.'),{status:413});}chunks.push(part.value);}
 const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
 try{return JSON.parse(new TextDecoder().decode(bytes));}catch(_){throw Object.assign(Error('Pedido inválido.'),{status:400});}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return new Response(JSON.stringify({error:'Use POST.'}),{status:405,headers:cors});
 try{
  const body=await readBody(req),result=await execute(body,req.headers.get('Authorization')||'');
  // Caminhos internos, credenciais e tokens jamais são devolvidos ao navegador.
  if(result.files)result.files=result.files.map(({id,tipo,mime,bytes,pronto}:any)=>({id,tipo,mime,bytes,pronto}));
  return new Response(JSON.stringify(result),{headers:cors});
 }catch(error){const e=error as {status?:number,message?:string};const status=e.status||503;return new Response(JSON.stringify({error:status===503?'O envio ou a consulta está indisponível. Tente novamente.':e.message}),{status,headers:cors});}
});
