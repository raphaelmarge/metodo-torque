// Locked web-push implements RFC8291 encryption and VAPID signatures. Fetch is
// used for transport so redirects are forbidden and total duration is bounded.
import webpush from 'npm:web-push@3.6.7';
import {createDispatcher,allowedEndpoint} from './worker.mjs';
const env=(name:string)=>Deno.env.get(name)||'';
const config={enabled:env('NUTRI_PUSH_ENABLED'),cronSecret:env('NUTRI_PUSH_CRON_SECRET'),publicKey:env('NUTRI_PUSH_PUBLIC_KEY'),privateKey:env('NUTRI_PUSH_PRIVATE_KEY'),subject:env('NUTRI_PUSH_SUBJECT')};
async function rpc(action:string,data:object){
 const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw Error('Configuration unavailable');
 const result=await fetch(url+'/rest/v1/rpc/nutri_push_worker',{method:'POST',headers:{'apikey':key,'Authorization':'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({p_action:action,p_data:data}),signal:AbortSignal.timeout(10000),redirect:'error'});
 if(!result.ok)throw Error('Scheduler unavailable');return await result.json();
}
async function send(subscription:object,payload:string,options:object){
 const details=webpush.generateRequestDetails(subscription,payload,options);
 if(!allowedEndpoint(details.endpoint))throw Error('Unsupported push host');
 const result=await fetch(details.endpoint,{method:'POST',headers:details.headers,body:new Uint8Array(details.body),redirect:'error',signal:AbortSignal.timeout(10000)});
 // Provider response bodies may contain private identifiers; discard them.
 await result.body?.cancel();return result.status;
}
Deno.serve(createDispatcher({config,rpc,send}));
