// Pure handler with injected I/O. No clinical data, endpoints or secrets in logs.
export function allowedEndpoint(value){
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!u.hash&&value.length<=2048&&/^(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)$/.test(u.hostname);}catch{return false;}
}
export function deliveryOutcome(status){return status>=200&&status<300?'sent':[404,410].includes(status)?'gone':status===429||status>=500?'retry':'failed';}
async function secretMatches(a,b){
 const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value||'')));
 const [x,y]=await Promise.all([hash(a),hash(b)]);let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return !!b&&difference===0;
}
export function createDispatcher({config,rpc,send,now=()=>Date.now()}){
 return async request=>{
  const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(request.method!=='POST')return response({error:'method'},405);
  if(!await secretMatches(request.headers.get('x-nutri-cron-secret'),config.cronSecret))return response({error:'unauthorized'},401);
  if(config.enabled!=='true')return response({enabled:false,processed:0});
  if(!config.publicKey||!config.privateKey||!/^mailto:[^\s@]+@[^\s@]+$/.test(config.subject||''))return response({error:'configuration'},503);
  let jobs;try{jobs=await rpc('claim',{});}catch{return response({error:'scheduler'},503);}
  const counts={sent:0,retry:0,failed:0,cancelled:0,expired:0,uncertain:0,gone:0};
  for(const job of jobs){
   let outcome='uncertain';
   try{
    if(!allowedEndpoint(job.subscription?.endpoint))outcome='failed';
    else if(Date.parse(job.expires_at)<=now())outcome='expired';
    else if(!(await rpc('validate',{id:job.id,lease:job.lease})).valid)outcome='cancelled';
    else{
     const ttl=Math.max(0,Math.min(3600,Math.floor((Date.parse(job.expires_at)-now())/1000)));
     if(!ttl)outcome='expired';
     else outcome=deliveryOutcome(await send(job.subscription,JSON.stringify({kind:job.kind,userId:job.userId,tag:job.id}),{TTL:ttl,topic:job.id.replaceAll('-',''),urgency:'normal',vapidDetails:{subject:config.subject,publicKey:config.publicKey,privateKey:config.privateKey}}));
    }
   }catch{/* Unknown acceptance: do not retry. Stable notification tag is additional deduplication. */}
   try{await rpc('finish',{id:job.id,lease:job.lease,outcome});}catch{return response({error:'ledger',processed:Object.values(counts).reduce((a,b)=>a+b,0)},503);}
   counts[outcome]++;
  }
  return response({enabled:true,processed:jobs.length,...counts});
 };
}
