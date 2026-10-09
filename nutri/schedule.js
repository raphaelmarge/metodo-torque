import {validDay} from './assessment.js';
import {mealPresence,nextMeal} from './care-progress.js';

export function calendarDay(value){
 if(value==null||value==='')return '';
 if(typeof value==='string'&&validDay(value))return value;
 const d=value instanceof Date?value:new Date(value);
 return Number.isFinite(+d)?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';
}
export function calendarDays(day,view='month'){
 if(!validDay(day))return [];
 const d=new Date(day+'T12:00:00');if(view==='month')d.setDate(1);
 d.setDate(d.getDate()-((d.getDay()+6)%7));
 return Array.from({length:view==='week'?7:42},(_,i)=>{const x=new Date(d);x.setDate(x.getDate()+i);return calendarDay(x);});
}
export function shiftCalendar(day,amount,view){
 if(!validDay(day)||!Number.isInteger(amount))return day;
 const d=new Date(day+'T12:00:00'),n=d.getDate();
 if(view==='week')d.setDate(n+amount*7);
 else{d.setDate(1);d.setMonth(d.getMonth()+amount);const end=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(n,end));}
 return calendarDay(d);
}
export function calendarEvents(state,filterPatient=''){
 const pro=state.role==='nutri',allowed=new Set(state.patients.map(x=>x.id));
 const allowedPatient=id=>allowed.has(id)&&(pro?(!filterPatient||id===filterPatient):id===state.selected);
 const appointments=state.appointments.filter(x=>allowedPatient(x.patient_id)&&calendarDay(x.start_at));
 const linked=new Set(appointments.map(x=>x.id));
 const result=appointments.map(x=>({id:x.id,kind:'appointment',patientId:x.patient_id,start:x.start_at,day:calendarDay(x.start_at),status:x.status||'scheduled',note:x.note||'',duration:x.duration_minutes||60}));
 for(const x of state.records){
  if(x.kind!=='appointment_request'||x.data?.archived||!allowedPatient(x.patient_id)||(!pro&&x.visibility!=='patient')||!calendarDay(x.data?.startAt))continue;
  if(x.data.status==='confirmed'&&linked.has(x.data.appointmentId))continue;
  if(!['requested','confirmed','refused'].includes(x.data.status))continue;
  result.push({id:x.id,kind:'request',patientId:x.patient_id,start:x.data.startAt,day:calendarDay(x.data.startAt),status:x.data.status,note:x.data.note||''});
 }
 return result.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||String(a.id).localeCompare(String(b.id)));
}

export function createSchedule(H,P){
 const {state,esc,today,render,heading}=H,s=state,q=x=>document.querySelector(x);
 let selected=today(),view='week',filter='',context='';
 const pro=()=>s().role==='nutri';
 const labels={scheduled:'Confirmada',completed:'Realizada',cancelled:'Cancelada',requested:'Aguardando confirmação',confirmed:'Pedido confirmado',refused:'Pedido recusado'};
 const date=d=>new Date(d+'T12:00:00').toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});
 const time=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
 const action=(label,act,id='',cls='')=>`<button class="btn ${cls}" data-x="${act}" data-id="${esc(id)}">${label}</button>`;
 const name=id=>s().patients.find(x=>x.id===id)?.name||'Paciente';
 function prepare(){const key=(s().user?.id||'demo')+':'+s().role+':'+(pro()?'all':s().selected);if(context!==key){context=key;selected=today();view=pro()?'week':'month';filter='';}if(filter&&!s().patients.some(x=>x.id===filter))filter='';}
 function eventRow(e){
  const nameLabel=pro()?name(e.patientId):e.kind==='request'?'Solicitação de consulta':'Consulta com '+s().clinic.professional_name;
  let buttons='';
  if(e.kind==='appointment'&&e.status!=='cancelled'){
   buttons+=action('Salvar no calendário','appointment-ics',e.id,'small ghost');
   if(e.status==='scheduled')buttons+=pro()?action('Remarcar','appointment-edit',e.id,'small')+action('Realizada','appointment-complete',e.id,'small')+action('Cancelar','appointment-cancel',e.id,'small ghost'):`<button class="btn small" data-calendar-reschedule="${esc(e.id)}">Preciso remarcar</button>`;
  }else if(pro()&&e.kind==='request'&&e.status==='requested')buttons=action('Confirmar / ajustar','request-confirm',e.id,'small primary')+action('Recusar','request-refuse',e.id,'small ghost');
  return `<article class="schedule-event status-${esc(e.status)}"><div class="schedule-time"><b>${time(e.start)}</b><small>${e.duration?e.duration+' min':'Pedido'}</small></div><div class="schedule-event-body"><b>${esc(nameLabel)}</b><span class="schedule-status">${labels[e.status]||'Consultar status'}</span>${e.note?`<p>${esc(e.note)}</p>`:''}${buttons?`<div class="actions">${buttons}</div>`:''}</div></article>`;
 }
 function meals(day){
  if(pro())return '';
  const published=H.published(),plan=published?.data;if(!plan)return '';
  const next=nextMeal({plan,day,now:new Date(),recordedMealIds:[]});
  if(['future-start','no-meals-today','inactive-plan'].includes(next.reason))return '';
  const list=typeof MT_NUTRICAO.refeicoesDia==='function'?MT_NUTRICAO.refeicoesDia(plan,day):plan.refeicoes||[];
  const registered=mealPresence({patientId:s().selected,day,logs:s().logs,records:s().records,planVersion:published.version}).mealIds;
  return list.length?`<section class="schedule-meals"><h3>Alimentação planejada</h3><p class="sub">Horários do seu plano atual. Consultar o calendário não registra consumo.</p>${list.slice().sort((a,b)=>(a.hora||'').localeCompare(b.hora||'')).map(m=>`<div class="schedule-meal"><span>${esc(m.hora||'Livre')}</span><div><b>${esc(m.titulo)}</b><small>${registered.includes(m.id)?'Com registro no diário':'Planejada'}</small></div><button class="btn small ghost" data-page="food">Ver plano</button></div>`).join('')}</section>`:'';
 }
 function viewPage(){
  prepare();const events=calendarEvents(s(),filter),days=calendarDays(selected,view),now=Date.now();
  const pending=events.filter(x=>x.status==='requested'),next=events.find(x=>x.kind==='appointment'&&x.status==='scheduled'&&Date.parse(x.start)>=now);
  const scope=pro()?'Seu consultório':'Sua programação';
  let html=heading(scope,pro()?'Agenda do consultório':'Minha agenda','Consultas e solicitações, no mesmo calendário.',`<button class="btn primary" data-calendar-new>${pro()?'+ Agendar consulta':'+ Solicitar consulta'}</button>`);
  html+=`<section class="schedule-hero"><div><span class="eyebrow">${next?'Próxima consulta':'Seu próximo encontro'}</span><h2>${next?esc(date(next.day)+' · '+time(next.start)):'Sua programação começa aqui'}</h2><p>${next?esc(pro()?name(next.patientId):s().clinic.professional_name):'Escolha uma data para organizar seu acompanhamento.'}</p></div>${next?`<div class="actions">${action('Salvar no calendário','appointment-ics',next.id)}${pro()?action('Remarcar','appointment-edit',next.id):`<button class="btn" data-calendar-reschedule="${esc(next.id)}">Preciso remarcar</button>`}</div>`:''}</section>`;
  if(pro())html+=`<label class="schedule-filter">Paciente<select id="schedule-patient"><option value="">Todos os pacientes</option>${s().patients.map(p=>`<option value="${esc(p.id)}" ${filter===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</select></label>`;
  html+=`<section class="card schedule-calendar"><div class="schedule-toolbar"><div class="schedule-zoom" role="group" aria-label="Visualização da agenda">${[['week','Semana'],['month','Mês']].map(([id,label])=>`<button class="btn small ${view===id?'primary':'ghost'}" data-calendar-view="${id}" aria-pressed="${view===id}">${label}</button>`).join('')}</div><div class="schedule-nav"><button class="btn small ghost" data-calendar-shift="-1" aria-label="${view==='week'?'Semana anterior':'Mês anterior'}">‹</button><button class="btn small" data-calendar-today>Hoje</button><button class="btn small ghost" data-calendar-shift="1" aria-label="${view==='week'?'Próxima semana':'Próximo mês'}">›</button></div></div><h2 class="schedule-month" aria-live="polite">${view==='month'?esc(new Date(selected+'T12:00:00').toLocaleDateString('pt-BR',{month:'long',year:'numeric'})):esc(date(days[0])+' a '+date(days.at(-1)))}</h2><div class="schedule-scroll"><div class="schedule-grid" role="group" aria-label="Escolher dia">${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(d=>`<span class="schedule-weekday">${d}</span>`).join('')}${days.map(d=>{const ev=events.filter(x=>x.day===d),confirmed=ev.some(x=>x.status==='scheduled'),waiting=ev.some(x=>x.status==='requested');return `<button class="schedule-day ${d===selected?'selected ':''}${d===today()?'is-today ':''}${view==='month'&&d.slice(0,7)!==selected.slice(0,7)?'outside':''}" data-calendar-day="${d}" aria-pressed="${d===selected}" aria-label="${esc(date(d)+(ev.length?', '+ev.length+' compromisso(s)':'')+(d===today()?', hoje':''))}"><b>${Number(d.slice(8))}</b><span class="calendar-dots" aria-hidden="true">${confirmed?'<i class="confirmed"></i>':''}${waiting?'<i class="requested"></i>':''}${ev.some(x=>!['scheduled','requested'].includes(x.status))?'<i></i>':''}</span></button>`;}).join('')}</div></div><div class="schedule-legend"><span><i class="confirmed"></i>Confirmada</span><span><i class="requested"></i>Aguardando</span><span><i></i>Histórico</span></div></section>`;
  const dayEvents=events.filter(x=>x.day===selected);
  html+=`<section class="card schedule-day-detail"><div class="card-head"><div><span class="eyebrow">${selected===today()?'Hoje':'Dia selecionado'}</span><h2>${esc(date(selected))}</h2></div>${selected>=today()||pro()?`<button class="btn small" data-calendar-new>${pro()?'+ Consulta':'+ Solicitar'}</button>`:''}</div><div role="status">${dayEvents.map(eventRow).join('')||'<div class="body-empty">Nenhuma consulta ou solicitação nesta data.</div>'}</div>${meals(selected)}</section>`;
  if(pending.length)html+=`<section class="card schedule-pending"><div class="card-head"><h2>${pro()?'Pedidos para confirmar':'Meus pedidos em aberto'}</h2><span class="pill">${pending.length}</span></div>${pending.map(e=>`<div class="schedule-pending-day">${esc(date(e.day))}</div>`+eventRow(e)).join('')}</section>`;
  return `<div class="schedule-app">${html}</div>`;
 }
 function redraw(selector){render();q(selector)?.focus({preventScroll:true});}
 async function openNew(){
  if(pro()){await H.action('new-appointment');const input=q('#appointment-time');if(input)input.value=selected+'T09:00';if(filter&&q('#appointment-patient'))q('#appointment-patient').value=filter;}
  else{await P.act('request-appointment');const input=q('#x-time');if(input){const next=new Date(Date.now()+3600000),day=selected<today()?today():selected;input.value=day===today()?calendarDay(next)+'T'+String(next.getHours()).padStart(2,'0')+':'+String(next.getMinutes()).padStart(2,'0'):day+'T09:00';input.min=today()+'T00:00';}}
 }
 function bind(){
  document.querySelectorAll('[data-calendar-day]').forEach(b=>b.onclick=()=>{if(s().busy)return;selected=b.dataset.calendarDay;redraw(`[data-calendar-day="${selected}"]`);});
  document.querySelectorAll('[data-calendar-view]').forEach(b=>b.onclick=()=>{if(s().busy)return;view=b.dataset.calendarView;redraw(`[data-calendar-view="${view}"]`);});
  document.querySelectorAll('[data-calendar-shift]').forEach(b=>b.onclick=()=>{if(s().busy)return;selected=shiftCalendar(selected,Number(b.dataset.calendarShift),view);redraw(`[data-calendar-shift="${b.dataset.calendarShift}"]`);});
  document.querySelectorAll('[data-calendar-today]').forEach(b=>b.onclick=()=>{if(s().busy)return;selected=today();redraw('[data-calendar-today]');});
  document.querySelectorAll('[data-calendar-new]').forEach(b=>b.onclick=()=>H.run(openNew));
  document.querySelectorAll('[data-calendar-reschedule]').forEach(b=>b.onclick=()=>{if(s().busy)return;const ap=s().appointments.find(x=>x.id===b.dataset.calendarReschedule&&x.patient_id===s().selected);if(!ap)return;s().page='chat';render();const input=q('#message-body');if(input){input.value=`Olá! Preciso remarcar a consulta de ${date(calendarDay(ap.start_at))}, às ${time(ap.start_at)}. Podemos combinar outro horário?`;input.focus();}});
  if(q('#schedule-patient'))q('#schedule-patient').onchange=e=>{if(s().busy)return;filter=e.target.value;redraw('#schedule-patient');};
 }
 return {view:viewPage,bind};
}
