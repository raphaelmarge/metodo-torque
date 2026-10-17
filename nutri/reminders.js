// Web Push consent is always initiated by the patient. No timers send messages.
export const REMINDER_DEFAULTS=Object.freeze({appointments:true,questionnaires:true,appointment_minutes:60,questionnaire_time:'09:00',timezone:'America/Sao_Paulo'});
export function reminderPreferences(value={}){
 const p={...REMINDER_DEFAULTS,...value};
 if(![15,30,60,120,1440].includes(Number(p.appointment_minutes)))throw Error('Escolha a antecedência da consulta.');
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(p.questionnaire_time))throw Error('Informe um horário válido.');
 try{new Intl.DateTimeFormat('pt-BR',{timeZone:p.timezone}).format();}catch{throw Error('Escolha um fuso horário válido.');}
 return {appointments:!!p.appointments,questionnaires:!!p.questionnaires,appointment_minutes:Number(p.appointment_minutes),questionnaire_time:p.questionnaire_time,timezone:p.timezone};
}
export function reminderSupport(env=globalThis){return !!(env.isSecureContext&&env.navigator?.serviceWorker&&env.PushManager&&env.Notification);}
function publicKey(value){const binary=atob(value.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(binary,x=>x.charCodeAt(0));}
export function createReminderController(H){
 let context='',generation=0,snapshot={available:false,enabled:false},loading=null,clearing=null;
 const state=H.state,db=H.database;
 const key=()=>{const s=state();return !s.demo&&s.role==='patient'&&s.user?.id&&s.patients?.find(p=>p.user_id===s.user.id)?s.user.id+':'+s.clinic.id:'';};
 const patientId=()=>state().patients?.find(p=>p.user_id===state().user?.id)?.id;
 async function registration(){return await navigator.serviceWorker.getRegistration(new URL('./',import.meta.url));}
 async function bindDevice(userId,expectedGeneration=generation){
  if(!globalThis.navigator?.serviceWorker)return;
  const reg=await registration();if(!reg?.active||expectedGeneration!==generation)return;
  await new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(Error('Não foi possível atualizar a proteção deste aparelho.')),4000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data?.ok?resolve():reject(Error('Não foi possível atualizar a proteção deste aparelho.'));};reg.active.postMessage({type:'NUTRI_REMINDER_ACCOUNT',userId:userId||null},[channel.port2]);});
 }
 async function rpc(action,data={}){const result=await db().rpc('nutri_reminders',{p_action:action,p_data:data});if(result.error)throw result.error;return result.data;}
 async function setContext(){
  if(clearing)await clearing.catch(()=>{});
  const next=key();if(next===context)return;
  context=next;generation++;snapshot={available:false,enabled:false};loading=null;
  await bindDevice(next?state().user.id:null);
 }
 async function load(){
  await setContext();if(!context)return snapshot;
  if(loading)return loading;
  const current=generation;
  loading=(async()=>{try{const data=await rpc('snapshot',{patient_id:patientId()});if(current===generation)snapshot={available:true,...data};}catch(e){if(current===generation)snapshot={available:false,enabled:false,error:e.code==='PGRST202'?'': 'Não foi possível consultar os lembretes. Tente atualizar.'};}finally{if(current===generation)loading=null;}return snapshot;})();return loading;
 }
 async function enable(preferences){
  if(!context||!snapshot.available||!snapshot.enabled)throw Error('O serviço de lembretes ainda não está ativado.');
  if(!reminderSupport())throw Error('Este navegador não oferece notificações. No iPhone, instale o app na Tela de Início.');
  const current=generation,p=reminderPreferences(preferences);
  // Must be directly reached from a click/submit; never request at startup.
  const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Permita as notificações nas configurações do navegador para ativar.');
  if(current!==generation)throw Error('A conta mudou. Entre novamente.');
  const reg=await registration();if(!reg?.active)throw Error('Abra novamente o app para concluir sua instalação.');
  let subscription=await reg.pushManager.getSubscription();
  if(!subscription)subscription=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:publicKey(snapshot.public_key)});
  try{
   if(current!==generation)throw Error('A conta mudou. Entre novamente.');
   const result=await rpc('subscribe',{patient_id:patientId(),subscription:subscription.toJSON(),preferences:p});
   if(current!==generation)throw Error('A conta mudou. Entre novamente.');
   snapshot={available:true,...result};await bindDevice(state().user.id);return snapshot;
  }catch(error){await subscription.unsubscribe().catch(()=>{});throw error;}
 }
 async function save(preferences){const current=generation,result=await rpc('preferences',{patient_id:patientId(),preferences:reminderPreferences(preferences)});if(current===generation)snapshot={available:true,...result};return snapshot;}
 async function disable(all=false){
  // Clear the worker first, so already queued pushes cannot appear on this device.
  await bindDevice(null);const reg=await registration(),sub=await reg?.pushManager.getSubscription();
  if(sub)await sub.unsubscribe();
  await rpc('unsubscribe',{patient_id:patientId(),endpoint:all?null:sub?.endpoint||'',all});
  return await load();
 }
 function clearDevice(){
  if(clearing)return clearing;
  const old=context,previous=db();context='';generation++;loading=null;snapshot={available:false,enabled:false};
  clearing=(async()=>{
   let failure=null;try{await bindDevice(null);}catch(error){failure=error;}
   try{const reg=globalThis.navigator?.serviceWorker?await registration():null,sub=await reg?.pushManager.getSubscription();
    if(sub){let timer;try{await Promise.race([sub.unsubscribe(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Não foi possível desligar a inscrição deste navegador.')),4000);})]);}finally{clearTimeout(timer);}
     // Local account isolation must never wait for a network RPC on sign-out.
     if(old&&previous)Promise.resolve(previous.rpc('nutri_reminders',{p_action:'unsubscribe',p_data:{endpoint:sub.endpoint}})).catch(()=>{});
    }
   }catch(error){failure=failure||error;}
   if(failure)throw failure;
  })().finally(()=>{clearing=null;});return clearing;
 }
 return {setContext,load,enable,save,disable,clearDevice,snapshot:()=>snapshot,revision:()=>generation,supported:()=>reminderSupport()};
}
