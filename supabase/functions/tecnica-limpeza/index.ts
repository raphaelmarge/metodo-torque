import {cleanupAdapter,cleanupHandler} from '../_shared/tecnica-cleanup.mjs';

// Deploy with verify_jwt=false. This worker does not accept user identities:
// the dedicated Vault-backed secret RPC below is mandatory and fails closed.
const base=Deno.env.get('SUPABASE_URL')||'',key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
function makeApi(deadline:AbortSignal){return async function api(path:string,init:RequestInit={}){
  if(!base||!key)throw Error('Configuração indisponível.');
  const r=await fetch(base+path,{...init,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json',...init.headers},signal:AbortSignal.any([deadline,AbortSignal.timeout(12000)])});
  if(!r.ok)throw Error('Operação indisponível.');
  return r.status===204?null:r.json();
 };}
Deno.serve((req:Request)=>{
 // Keep the complete request below the scheduler's 55-second timeout, even
 // when a Storage request starts near the end of the processing budget.
 const api=makeApi(AbortSignal.timeout(48000));
 return cleanupHandler({
  authorize:(secret:string)=>api('/rest/v1/rpc/tecnica_limpeza_autoriza',{method:'POST',body:JSON.stringify({p_segredo:secret})}),
  cleanup:cleanupAdapter(api)
 })(req);
});
