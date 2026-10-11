// Guided consultations reuse private session records. Finalization does not
// publish a plan, change appointments, consume packages or send messages.
const copy=value=>structuredClone(value);
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&Number.isFinite(Date.parse(value+'T12:00:00Z'))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;
const reference=x=>x?{id:x.id,version:x.version}:null;
export function consultationState(record){return record?.data?.consultationSchema===1&&record.data.status==='draft'?'draft':record?.data?.consultationSchema===1&&record.data.status==='completed'?'completed':'legacy';}
export function consultationContext(state,patientId){
 const patient=state.patients.find(x=>x.id===patientId&&x.clinic_id===state.clinic?.id);
 if(!patient)return null;
 const list=(state.records||[]).filter(x=>x.patient_id===patientId&&!x.data?.archived&&!x.archived);
 const latest=kinds=>list.filter(x=>kinds.includes(x.kind)).sort((a,b)=>String(a.data?.day||a.updated_at||a.created_at||'').localeCompare(String(b.data?.day||b.updated_at||b.created_at||''))||Number(a.version||0)-Number(b.version||0)||String(a.id).localeCompare(String(b.id))).at(-1)||null;
 const anamnesis=latest(['anamnesis']),assessment=latest(['assessment','measurement']);
 const plan=(state.plans||[]).filter(x=>x.patient_id===patientId&&x.status==='published').sort((a,b)=>Number(a.version||0)-Number(b.version||0)).at(-1)||null;
 return {patient,anamnesis,assessment,plan,refs:{anamnesis:reference(anamnesis),assessment:reference(assessment),plan:reference(plan)}};
}
export function buildConsultationData({existing=null,values,context,now=new Date().toISOString()}){
 if(!context?.patient)throw Error('O paciente não está disponível neste consultório.');
 if(existing&&(existing.kind!=='session'||existing.patient_id!==context.patient.id||existing.data?.archived||existing.archived))throw Error('Este atendimento não está disponível para edição.');
 const fields={day:10,reason:2000,observations:4000,text:16000,followUp:4000,returnOn:10,referral:2000,correctionReason:2000};
 const clean={};for(const [key,max] of Object.entries(fields)){clean[key]=String(values?.[key]??'').trim();if(clean[key].length>max)throw Error('O campo da consulta excedeu o limite permitido.');}
 if(!validDay(clean.day))throw Error('Informe uma data válida para a consulta.');
 if(clean.returnOn&&(!validDay(clean.returnOn)||clean.returnOn<clean.day))throw Error('A data de retorno deve ser igual ou posterior à consulta.');
 const status=values?.status;if(!['draft','completed'].includes(status))throw Error('Escolha rascunho ou consulta finalizada.');
 if(status==='completed'&&(!clean.reason||!clean.text))throw Error('Registre o motivo e a conduta antes de finalizar.');
 if(status==='completed'&&values.confirmed!==true)throw Error('Confirme a revisão do atendimento antes de finalizar.');
 const append=!!existing&&consultationState(existing)!=='draft';
 if(append&&!clean.correctionReason)throw Error('Informe o motivo do complemento ou correção.');
 const data={...copy(existing?.data||{}),...clean,consultationSchema:1,status,contextRefs:copy(context.refs)};
 delete data.completedAt;
 if(status==='completed')data.completedAt=now;
 if(append){data.supersedesId=existing.id;data.supersedesVersion=existing.version;data.originalContextRefs=copy(existing.data?.contextRefs||{});}
 return {data,existing:append?null:existing,visibility:'private'};
}
export function createConsultation(H,P){
 const {state,esc,modal,today,dateLabel,run}=H;
 const q=selector=>document.querySelector(selector);
 const field=(label,id,value='',type='text',extra='')=>`<label>${label}<input id="${id}" type="${type}" value="${esc(value)}" ${extra}></label>`;
 const area=(label,id,value='',max=4000)=>`<label>${label}<textarea id="${id}" maxlength="${max}">${esc(value)}</textarea></label>`;
 const stateLabel=record=>({draft:'Rascunho privado',completed:'Atendimento finalizado',legacy:'Registro anterior'})[consultationState(record)];
 function authorized(patientId){const s=state();if(s.role!=='nutri')throw Error('O atendimento é privado da profissional.');const context=consultationContext(s,patientId);if(!context)throw Error('O paciente não está disponível neste consultório.');return context;}
 function contextHTML(context){
  const a=context.anamnesis,v=context.assessment,p=context.plan;
  const summary=(label,value)=>value?`<p><b>${label}:</b> ${esc(value)}</p>`:'';
  return `<details open><summary>Contexto do acompanhamento</summary><p class="sub">Referências consultadas agora. O registro da consulta preserva os identificadores e as versões.</p><div class="form-grid"><section><h3>Anamnese</h3>${a?`<p class="sub">${esc(a.title)} · versão ${esc(a.version)}</p>${summary('Alergias e restrições',a.data.allergies)}${summary('Condições informadas',a.data.conditions)}${summary('Medicamentos e suplementos',a.data.medications)}${summary('Exames informados',a.data.exams)}${summary('Rotina',a.data.routine)}${summary('Preferências',a.data.preferences)}`:'<p class="sub">Nenhuma anamnese carregada para este paciente.</p>'}</section><section><h3>Avaliação e plano</h3>${v?`<p>${esc(v.title)} · versão ${esc(v.version)}</p>${summary('Data informada',v.data.day)}${summary('Origem',v.data.source)}${summary('Método',v.data.method)}`:'<p class="sub">Nenhuma avaliação carregada.</p>'}${p?`<p>Plano publicado: ${esc(p.data?.titulo||'Plano alimentar')} · versão ${esc(p.version)}</p>`:'<p class="sub">Nenhum plano publicado carregado.</p>'}</section></div></details>`;
 }
 function edit(original){
  const existing=original?copy(original):null,patientId=existing?.patient_id||state().selected,context=authorized(patientId),s=state();
  if(existing?._history)throw Error('Uma versão histórica está disponível somente para leitura.');
  const owner={userId:s.user?.id||null,clinicId:s.clinic?.id,selected:s.selected,demo:s.demo,epoch:H.sessionEpoch?.()},d=existing?.data||{},append=!!existing&&consultationState(existing)!=='draft';
  const body=`<p><b>${esc(context.patient.name)}</b></p><p class="sub">Registro privado da consulta. Publicar o plano, agendar retorno e registrar consumo de pacote são ações separadas.</p>${append?'<div class="notice">O atendimento original permanece no histórico. Esta correção ou complemento será um novo registro.</div>':''}${s.offline||s.loadError?'<div class="notice">A leitura pode estar incompleta. Reconecte e atualize antes de salvar.</div>':''}${contextHTML(context)}${field('Título','consultation-title',existing?.title||'Atendimento nutricional','text','required maxlength="200"')}${field('Data da consulta','consultation-day',validDay(d.day)?d.day:today(),'date','required')}${area('Motivo e objetivos da consulta','consultation-reason',d.reason||'',2000)}${area('Observações e relato do paciente','consultation-observations',d.observations||'')}${area('Conduta e registro clínico','consultation-text',d.text||'',16000)}${area('Próximos cuidados a revisar','consultation-followUp',d.followUp||'')}${field('Retorno sugerido (não agenda consulta)','consultation-returnOn',d.returnOn||'','date')}${area('Encaminhamento, se necessário (não enviado)','consultation-referral',d.referral||'',2000)}${append?area('Motivo do complemento ou correção','consultation-correctionReason','',2000):''}<label>Situação ao salvar<select id="consultation-status"><option value="draft">Rascunho privado</option><option value="completed">Finalizar atendimento</option></select></label><label class="check-label"><input id="consultation-confirmed" type="checkbox"> Revisei os dados e confirmo a finalização deste atendimento.</label><p class="sub">O rascunho não conta como atendimento finalizado. A finalização não publica a prescrição nem altera a agenda ou o financeiro.</p>`;
  modal(append?'Complementar atendimento':'Consulta guiada',body,async()=>{
   const current=state();if(current.role!=='nutri'||(current.user?.id||null)!==owner.userId||current.clinic?.id!==owner.clinicId||current.selected!==owner.selected||current.demo!==owner.demo||H.sessionEpoch?.()!==owner.epoch)throw Error('A conta ou o paciente mudou. Reabra a consulta no contexto correto.');
   authorized(patientId);if(!current.demo&&(current.offline||current.loadError))throw Error('Atualize os dados com conexão antes de salvar o atendimento.');
   if(existing){const live=current.records.find(x=>x.id===existing.id&&x.patient_id===patientId);if(!live||live.version!==existing.version)throw Error('O atendimento mudou em outra sessão. Reabra antes de salvar.');}
   const title=q('#consultation-title').value.trim();if(!title||title.length>200)throw Error('Preencha um título com até 200 caracteres.');
   const values=Object.fromEntries(['day','reason','observations','text','followUp','returnOn','referral','correctionReason','status'].map(key=>[key,q('#consultation-'+key)?.value||'']));values.confirmed=!!q('#consultation-confirmed').checked;
   const result=buildConsultationData({existing,values,context});
   await P.saveRecord('session',title,result.data,result.visibility,result.existing,patientId);
  });
  const submit=q('#modal-form button[type=submit]');if(submit)submit.textContent='Salvar rascunho';
  const status=q('#consultation-status');if(status)status.onchange=()=>{if(submit)submit.textContent=status.value==='completed'?'Confirmar finalização':'Salvar rascunho';};
 }
 function detail(record){
  authorized(record.patient_id);const d=record.data||{},show=(label,value)=>value?`<div class="summary-line"><b>${label}</b><span style="white-space:pre-wrap">${esc(value)}</span></div>`:'';
  let html=`<p class="sub">${stateLabel(record)} · versão ${esc(record.version)}</p>${show('Data da consulta',validDay(d.day)?dateLabel(d.day):'Não informada no registro')}${show('Motivo',d.reason)}${show('Observações',d.observations)}${show('Conduta',d.text)}${show('Próximos cuidados',d.followUp)}${show('Retorno sugerido',validDay(d.returnOn)?dateLabel(d.returnOn):'')}${show('Encaminhamento registrado',d.referral)}${show('Motivo do complemento',d.correctionReason)}${d.supersedesId?`<p class="sub">Complementa o registro ${esc(d.supersedesId)} · versão ${esc(d.supersedesVersion)}.</p>`:''}`;
  if(d.contextRefs)html+=`<details><summary>Versões consultadas</summary>${Object.entries(d.contextRefs).filter(([,v])=>v).map(([key,v])=>show(({anamnesis:'Anamnese',assessment:'Avaliação',plan:'Plano publicado'})[key]||key,`${v.id} · versão ${v.version}`)).join('')||'<p class="sub">Sem referência disponível.</p>'}</details>`;
  if(!record._history)html+=`<div class="actions"><button class="btn" data-consultation-edit="${esc(record.id)}">${consultationState(record)==='draft'?'Continuar rascunho':'Complementar ou corrigir'}</button><button class="btn ghost" data-x="record-history" data-id="${esc(record.id)}">Ver versões anteriores</button></div>`;
  modal(esc(record.title),html);P.bind?.();bind();
 }
 function bind(){document.querySelectorAll('[data-consultation-edit]').forEach(button=>button.onclick=()=>run(()=>{const record=state().records.find(x=>x.id===button.dataset.consultationEdit);if(!record)throw Error('O atendimento não está disponível.');edit(record);}));}
 return {edit,detail,bind};
}
