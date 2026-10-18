import {REMINDER_DEFAULTS} from './reminders.js';
export function createReminderSettings(H){
 const esc=H.esc,controller=H.reminders;
 let requested='',loading=false;
 function view(){
  const s=H.state();
  if(s.role!=='patient')return '<p class="sub">Cada paciente pode ativar notificações de consultas e questionários em Ajustes e dados no próprio aparelho. Os lembretes não mostram informações clínicas.</p>';
  if(s.demo)return '<p class="sub">Na conta do paciente, você pode escolher consultas, questionários e horários. A demonstração não pede permissão nem envia notificações.</p>';
  const snap=controller?.snapshot()||{};
  if(!snap.available)return `<p class="sub" role="status">${esc(snap.error||'Os lembretes externos ainda não estão disponíveis neste consultório.')}</p><button class="btn ghost" data-reminders-load>Atualizar disponibilidade</button>`;
  if(!snap.enabled)return '<p class="sub">Os lembretes externos estão preparados, aguardando ativação do serviço. Nenhuma notificação será enviada.</p>';
  if(!controller.supported())return '<p class="sub">Este navegador não oferece notificações. No iPhone, adicione o Torque Nutri à Tela de Início e abra por lá.</p>';
  const p={...REMINDER_DEFAULTS,...snap.preferences},active=snap.devices>0;
  return `<p class="sub">Receba um aviso discreto mesmo com o app fechado. O recebimento depende da conexão e das permissões do aparelho.</p><p role="status">${active?'Lembretes autorizados em '+snap.devices+' aparelho(s).':'Nenhum aparelho autorizado.'}</p><form id="reminder-preferences"><label class="check-label"><input id="reminder-appointments" type="checkbox" ${p.appointments?'checked':''}> Lembrar consultas</label><label>Antecedência<select id="reminder-minutes">${[[15,'15 minutos'],[30,'30 minutos'],[60,'1 hora'],[120,'2 horas'],[1440,'1 dia']].map(([v,t])=>`<option value="${v}" ${p.appointment_minutes===v?'selected':''}>${t}</option>`).join('')}</select></label><label class="check-label"><input id="reminder-questionnaires" type="checkbox" ${p.questionnaires?'checked':''}> Lembrar questionários pendentes</label><label>Horário dos questionários<input id="reminder-time" type="time" required value="${esc(p.questionnaire_time)}"></label><label>Fuso horário<input id="reminder-timezone" required value="${esc(p.timezone)}" placeholder="America/Sao_Paulo" list="reminder-timezones"></label><datalist id="reminder-timezones"><option value="America/Sao_Paulo"><option value="America/Manaus"><option value="America/Rio_Branco"><option value="America/Noronha"><option value="Europe/Lisbon"></datalist><p class="sub">Um aviso por consulta e por período de questionário. Horários respeitam o fuso escolhido; as consultas mantêm seu instante agendado.</p><div class="actions"><button class="btn primary" type="submit">${active?'Salvar preferências':'Ativar neste aparelho'}</button>${active?'<button class="btn" type="button" data-reminders-enable>Ativar neste aparelho</button><button class="btn ghost" type="button" data-reminders-disable>Desligar neste aparelho</button><button class="btn ghost" type="button" data-reminders-disable-all>Desligar em todos</button>':''}</div></form>`;
 }
 function bind(){
  if(!controller)return;
  const q=x=>document.querySelector(x),prefs=()=>({appointments:q('#reminder-appointments').checked,questionnaires:q('#reminder-questionnaires').checked,appointment_minutes:Number(q('#reminder-minutes').value),questionnaire_time:q('#reminder-time').value,timezone:q('#reminder-timezone').value.trim()});
  const task=fn=>H.run(async()=>{await fn();H.render();});
  q('[data-reminders-load]')?.addEventListener('click',()=>task(()=>controller.load()));
  q('#reminder-preferences')?.addEventListener('submit',e=>{e.preventDefault();task(()=>controller.snapshot().devices?controller.save(prefs()):controller.enable(prefs()));});
  q('[data-reminders-enable]')?.addEventListener('click',()=>task(()=>controller.enable(prefs())));
  q('[data-reminders-disable]')?.addEventListener('click',()=>task(()=>controller.disable()));
  q('[data-reminders-disable-all]')?.addEventListener('click',()=>task(()=>controller.disable(true)));
  const s=H.state(),key=s.demo?'':s.user?.id+':'+s.clinic?.id+':'+controller.revision();
  if(key&&s.role==='patient'&&key!==requested&&!loading){requested=key;loading=true;controller.load().then(()=>{if(H.state().page==='settings')H.render();}).finally(()=>{loading=false;});}
 }
 return {view,bind};
}
