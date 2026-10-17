// Called only by authenticated server adapters. Paths originate in private
// SQL receipts, never in the HTTP caller's body. No secret/path is logged.
const UUID='[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const ID=new RegExp('^'+UUID+'$','i');
const PATH=new RegExp('^('+UUID+')/('+UUID+')/'+UUID+'\\.(mp4|webm|mov|m4a|mp3|ogg|wav)$','i');
const enc=value=>encodeURIComponent(String(value));
function validPath(path,academia,review){const m=typeof path==='string'&&PATH.exec(path);return !!(m&&m[1]===academia&&(!review||m[2]===review));}
export function cleanupAdapter(api){
 return async function cleanup({academia=null,limit=50,budgetMs=40000,now=()=>Date.now()}={}){
  if(academia!==null&&!ID.test(academia)||!Number.isInteger(limit)||limit<1||limit>50)throw Error('Escopo de limpeza inválido.');
  const started=now(),due=new Date(started).toISOString(),scope=academia?'&academia_id=eq.'+enc(academia):'';
  const [orfaos,revisoes]=await Promise.all([
   api('/rest/v1/app_tecnica_orfaos?select=caminho,academia_id,limpeza_apos&limpeza_apos=lte.'+enc(due)+scope+'&order=limpeza_apos.asc&limit='+limit),
   api('/rest/v1/app_tecnica_revisoes?select=id,academia_id,limpeza_apos&apagado_em=not.is.null&limpo_em=is.null&limpeza_apos=lte.'+enc(due)+scope+'&order=limpeza_apos.asc&limit='+limit)
  ]);
  if(!Array.isArray(orfaos)||!Array.isArray(revisoes))throw Error('Fila de limpeza indisponível.');
  const jobs=[...orfaos.map(row=>({row,orphan:true})),...revisoes.map(row=>({row,orphan:false}))].sort((a,b)=>String(a.row.limpeza_apos).localeCompare(String(b.row.limpeza_apos))).slice(0,limit);
  const result={processed:0,failed:0,deferred:0};
  for(let index=0;index<jobs.length;index++){
   if(now()-started>=budgetMs){result.deferred=jobs.length-index;break;}
   const {row,orphan}=jobs[index];
   try{
    if(!ID.test(row.academia_id)||academia&&row.academia_id!==academia||!Number.isFinite(Date.parse(row.limpeza_apos))||Date.parse(row.limpeza_apos)>started)throw Error('Recibo inválido.');
    let paths;
    if(orphan){if(!validPath(row.caminho,row.academia_id))throw Error('Caminho inválido.');paths=[row.caminho];}
    else{
     if(!ID.test(row.id))throw Error('Revisão inválida.');
     const files=await api('/rest/v1/app_tecnica_arquivos?select=caminho&revisao_id=eq.'+enc(row.id));
     if(!Array.isArray(files)||files.some(f=>!validPath(f.caminho,row.academia_id,row.id)))throw Error('Arquivo inválido.');paths=files.map(f=>f.caminho);
    }
    // A successful Storage DELETE also confirms an already absent object.
    // Network/API failure throws before acknowledging this durable receipt.
    if(paths.length)await api('/storage/v1/object/tecnica-privada',{method:'DELETE',body:JSON.stringify({prefixes:paths})});
    if(orphan){
     // Another transaction may have extended the upload grace period. Only
     // acknowledge the exact receipt read by this run.
     await api('/rest/v1/app_tecnica_orfaos?caminho=eq.'+enc(row.caminho)+'&academia_id=eq.'+enc(row.academia_id)+'&limpeza_apos=eq.'+enc(row.limpeza_apos),{method:'DELETE',headers:{Prefer:'return=minimal'}});
    }else await api('/rest/v1/app_tecnica_revisoes?id=eq.'+enc(row.id)+'&academia_id=eq.'+enc(row.academia_id)+'&apagado_em=not.is.null&limpo_em=is.null&limpeza_apos=eq.'+enc(row.limpeza_apos),{method:'PATCH',headers:{Prefer:'return=minimal'},body:JSON.stringify({limpo_em:new Date(now()).toISOString()})});
    result.processed++;
   }catch(_){result.failed++;}
  }
  return result;
 };
}

// JWT verification is disabled for this internal worker only. A private RPC
// compares the supplied secret against Vault before any cleanup query runs.
export function cleanupHandler({authorize,cleanup}){
 const headers={'Content-Type':'application/json','Cache-Control':'no-store'};
 const response=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 return async function handle(req){
  if(req.method!=='POST')return response(405,{error:'Use POST.'});
  const secret=req.headers.get('x-tecnica-secret')||'';
  if(secret.length<32||secret.length>512)return response(401,{error:'Não autorizado.'});
  try{
   if(await authorize(secret)!==true)return response(401,{error:'Não autorizado.'});
   // Intentionally never parse the request body: no supplied path, tenant,
   // time boundary or limit can influence this fixed maintenance operation.
   const result=await cleanup({limit:50,budgetMs:40000});
   return response(result.failed?503:200,{ok:!result.failed,...result});
  }catch(_){return response(503,{error:'Limpeza indisponível. A fila será tentada novamente.'});}
 };
}
