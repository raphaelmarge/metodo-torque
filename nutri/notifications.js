import {visibleRecords,recordDay} from './assessment.js';

// Only already-loaded, patient-visible data becomes an in-app notice.
// Read receipts are browser preferences, never clinical records or messages.
export function patientNotifications(state,now=Date.now()){
 const patient=state.patients?.find(x=>x.id===state.selected);
 if(state.role!=='patient'||!patient)return [];
 const items=[],valid=value=>Number.isFinite(Date.parse(value||'')),short=value=>String(value||'').replace(/\s+/g,' ').slice(0,180);
 const push=(kind,row,revision,title,body,page,date)=>{if(!row.id)return;items.push({id:JSON.stringify([kind,String(row.id),String(revision||'')]),kind,title,body:short(body),page,date:valid(date)?date:'',time:valid(date)?Date.parse(date):0});};
 for(const row of state.messages||[]){
  if(row.patient_id!==patient.id||!patient.clinician_id||row.sender_id!==patient.clinician_id)continue;
  push('message',row,row.updated_at||row.created_at,'Mensagem da sua nutri',row.body,'chat',row.created_at);
 }
 const plan=(state.plans||[]).find(x=>x.patient_id===patient.id&&x.status==='published');
 if(plan)push('plan',plan,plan.version,'Plano alimentar disponível',plan.data?.titulo,'food',plan.published_at||plan.updated_at||plan.created_at);
 const appointments=(state.appointments||[]).filter(x=>x.patient_id===patient.id&&valid(x.start_at));
 for(const row of appointments){
  const status=row.status||'scheduled';
  if(!['scheduled','cancelled'].includes(status)||Date.parse(row.start_at)<now)continue;
  const when=new Date(row.start_at).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
  push('appointment',row,[status,row.start_at,row.updated_at||''].join('|'),status==='cancelled'?'Consulta cancelada':'Sua próxima consulta',when,'booking',row.updated_at||row.created_at||row.start_at);
 }
 const rows=visibleRecords(state.records||[],patient.id,'patient',['assessment','measurement','appointment_request','nutrition_feedback','food_journal']);
 for(const row of rows){
  const data=row.data||{},at=row.updated_at||row.created_at,revision=row.version||at;
  if(['assessment','measurement'].includes(row.kind)&&patient.clinician_id&&row.created_by===patient.clinician_id){
   push('assessment',row,revision,'Avaliação compartilhada',[row.title||'Avaliação',recordDay(row)].filter(Boolean).join(' · '),'progress',at);
  }else if(row.kind==='appointment_request'&&['confirmed','refused'].includes(data.status)){
   if(data.status==='confirmed'&&appointments.some(x=>x.id===data.appointmentId))continue;
   push('request',row,[revision,data.status].join('|'),data.status==='confirmed'?'Consulta confirmada':'Resposta ao pedido de consulta',data.status==='refused'?'O horário solicitado não foi confirmado. Abra a agenda para escolher outro.':'Confira a data e o horário na sua agenda.','booking',at);
  }else if(row.kind==='nutrition_feedback'&&patient.clinician_id&&row.created_by===patient.clinician_id&&row.clinician_id===patient.clinician_id&&rows.some(x=>x.id===data.entryId&&x.kind==='food_journal')){
   push('feedback',row,revision,'Orientação sobre seu diário',data.text,'journal',at);
  }
 }
 return items.sort((a,b)=>b.time-a.time||a.id.localeCompare(b.id)).slice(0,30);
}

export function createPatientNotifications(H,P){
 const {state,esc,modal,render}=H,q=x=>document.querySelector(x);
 const scopes=new Map();
 function scope(){
  const s=state(),key=['torque-nutri-notifications-v1',s.demo?'demo':s.user?.id||'anonymous',s.clinic?.id||'',s.selected||''].map(encodeURIComponent).join(':');
  if(!scopes.has(key)){
   let saved=[];
   if(!s.demo&&s.user?.id)try{saved=JSON.parse((P.storage||globalThis.localStorage)?.getItem(key)||'[]');}catch{}
   scopes.set(key,new Set(Array.isArray(saved)?saved.filter(x=>typeof x==='string'&&x.length<1000).slice(-200):[]));
  }
  return {key,read:scopes.get(key),persist:!s.demo&&!!s.user?.id};
 }
 const entries=()=>{const {read}=scope();return patientNotifications(state()).map(x=>({...x,unread:!read.has(x.id)}));};
 function remember(ids){
  const {key,read,persist}=scope();for(const id of ids)read.add(id);
  while(read.size>200)read.delete(read.values().next().value);
  if(persist)try{(P.storage||globalThis.localStorage)?.setItem(key,JSON.stringify([...read]));}catch{}
 }
 function button(){
  if(state().role!=='patient')return '';
  const count=entries().filter(x=>x.unread).length,label='Notificações'+(count?', '+count+' não '+(count===1?'lida':'lidas'):'');
  return '<button type="button" class="btn icon-button notification-bell" id="patient-notifications-button" data-notifications aria-haspopup="dialog" aria-label="'+esc(label)+'">'+P.icon('bell')+(count?'<span class="notification-badge" aria-hidden="true">'+(count>9?'9+':count)+'</span>':'')+'</button>';
 }
 function open(){
  if(state().role!=='patient'||state().busy)return;
  const list=entries(),unread=list.filter(x=>x.unread).length;
  modal('Notificações','<div class="notifications-content"><div class="notification-toolbar"><p class="sub">'+(unread?unread+' '+(unread===1?'novidade':'novidades')+' no seu acompanhamento.':'Você está em dia com os avisos.')+'</p>'+(unread?'<button type="button" class="btn small ghost" id="notifications-read-all">Marcar todas como lidas</button>':'')+'</div><div class="notification-list">'+(list.map(x=>'<button type="button" class="notification-item '+(x.unread?'unread':'')+'" data-notice-id="'+esc(x.id)+'"><span class="notification-item-icon">'+P.icon(x.page)+'</span><span class="notification-copy"><strong>'+esc(x.title)+'</strong><span>'+esc(x.body)+'</span>'+(x.date?'<small>'+esc(new Date(x.date).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}))+'</small>':'')+'</span><span class="notification-state">'+(x.unread?'Nova':'Lida')+'</span></button>').join('')||'<div class="notification-empty">'+P.icon('bell')+'<h3>Nenhuma novidade por enquanto</h3><p>Mensagens, consultas e atualizações do seu acompanhamento aparecerão aqui.</p></div>')+'</div></div>');
  bind();
 }
 function bind(){
  document.querySelectorAll('[data-notifications]').forEach(b=>b.onclick=open);
  document.querySelectorAll('[data-notice-id]').forEach(b=>b.onclick=()=>{
   if(state().busy)return;
   const item=entries().find(x=>x.id===b.dataset.noticeId);if(!item)return;
   remember([item.id]);q('#modal')?.close();state().page=item.page;render();
  });
  if(q('#notifications-read-all'))q('#notifications-read-all').onclick=()=>{if(state().busy)return;remember(entries().map(x=>x.id));render();open();q('#close-modal')?.focus();};
 }
 return {button,open,bind,entries};
}
