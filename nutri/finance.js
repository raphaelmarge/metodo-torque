// Existing financial_entries plus an optional, server-authoritative manual ledger.
// No gateway, client ledger or automatic monetary operation is activated here.
const METHODS={pix:'Pix',card:'Cartão',cash:'Dinheiro',transfer:'Transferência',other:'Outro'};
const BASES={due:'Vencimento',paid:'Recebimento / pagamento',competency:'Competência'};
export function validFinanceDay(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function moneyCents(value){
 const text=String(value??'').trim().replace(',','.');
 if(!/^\d+(?:\.\d{1,2})?$/.test(text))throw Error('Informe um valor positivo com até duas casas decimais.');
 const [whole,fraction='']=text.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));
 if(!Number.isSafeInteger(amount)||amount<1||amount>1000000000)throw Error('O valor deve estar entre R$ 0,01 e R$ 10.000.000,00.');
 return amount;
}
export function financeStatus(entry,today){return entry.status==='void'?'void':Number(entry.refunded_cents)>0?'refunded':entry.status==='paid'?'paid':Number(entry.received_cents)>0?'partial':entry.due_on<today?'overdue':'pending';}
export function filterFinance(entries,filter,today){
 return entries.filter(entry=>{
  if(filter.patient&&entry.patient_id!==filter.patient)return false;
  if(filter.kind&&entry.kind!==filter.kind)return false;
  if(filter.status==='overdue'){if(entry.status!=='pending'||entry.due_on>=today)return false;}
  else if(filter.status==='pending'){if(entry.status!=='pending'||entry.due_on<today)return false;}
  else if(filter.status&&filter.status!=='all'&&financeStatus(entry,today)!==filter.status)return false;
  if(filter.status!=='void'&&filter.status!=='all'&&entry.status==='void')return false;
  const day=filter.basis==='competency'?entry.competency_on:filter.basis==='paid'?(entry.status==='paid'?entry.paid_on:null):entry.due_on;
  if(!validFinanceDay(day))return false;
  return (!filter.from||day>=filter.from)&&(!filter.to||day<=filter.to);
 }).slice().sort((a,b)=>String(filter.basis==='competency'?b.competency_on:filter.basis==='paid'?b.paid_on:b.due_on).localeCompare(String(filter.basis==='competency'?a.competency_on:filter.basis==='paid'?a.paid_on:a.due_on))||String(a.id).localeCompare(String(b.id)));
}
export function financeTotals(entries){
 const totals={incomePaid:0,incomePending:0,expensePaid:0,expensePending:0,voidCount:0};
 for(const entry of entries){if(entry.status==='void'){totals.voidCount++;continue;}
  const amount=Number(entry.amount_cents);if(!Number.isSafeInteger(amount)||amount<1)continue;
  if(entry.ledger_managed){const prefix=entry.kind==='income'?'income':'expense';totals[prefix+'Paid']+=Number(entry.net_paid_cents)||0;totals[prefix+'Pending']+=Number(entry.balance_cents)||0;}
  else{const key=entry.kind==='income'?(entry.status==='paid'?'incomePaid':'incomePending'):(entry.status==='paid'?'expensePaid':'expensePending');totals[key]+=amount;}
 }return {...totals,balance:totals.incomePaid-totals.expensePaid};
}
export function installmentAmounts(total,count){
 if(!Number.isInteger(total)||!Number.isInteger(count)||count<1||count>60||count>total)throw Error('Use entre 1 e 60 parcelas, com pelo menos R$ 0,01 por parcela.');
 const base=Math.floor(total/count);return Array.from({length:count},(_,index)=>base+(index<total%count?1:0));
}
export function installmentDay(first,index){
 if(!validFinanceDay(first))throw Error('Informe um vencimento válido.');
 const [year,month,day]=first.split('-').map(Number),date=new Date(Date.UTC(year,month-1+index,1,12)),last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0,12)).getUTCDate();
 date.setUTCDate(Math.min(day,last));return date.toISOString().slice(0,10);
}
export function financeCashEntries(entries,events,filters,today){
 const visible=filterFinance(entries,{...filters,basis:'due',from:'',to:''},today),result=[];
 for(const entry of visible){
  const moves=events.filter(event=>event.entry_id===entry.id&&['payment','refund','opening'].includes(event.kind)&&Number(event.amount_cents)>0&&validFinanceDay(event.occurred_on)&&(!filters.from||event.occurred_on>=filters.from)&&(!filters.to||event.occurred_on<=filters.to));
  if(!moves.length)continue;
  const received=moves.filter(x=>x.kind!=='refund').reduce((total,x)=>total+Number(x.amount_cents),0),refunded=moves.filter(x=>x.kind==='refund').reduce((total,x)=>total+Number(x.amount_cents),0);
  result.push({...entry,net_paid_cents:received-refunded,balance_cents:0,period_received_cents:received,period_refunded_cents:refunded,_cashOn:moves.map(x=>x.occurred_on).sort().at(-1)});
 }return result.sort((a,b)=>b._cashOn.localeCompare(a._cashOn)||String(a.id).localeCompare(String(b.id)));
}
export function safeFinanceCSV(rows){
 // Leading spaces, tabs and line breaks can hide a spreadsheet formula.
 const cell=value=>{let text=String(value??'');if(/^[\s\uFEFF]*[=+@-]/.test(text)||/^[\t\r\n]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
 return '\uFEFF'+rows.map(row=>row.map(cell).join(';')).join('\r\n');
}
export function createFinance(H,D){
 const {esc,today,dateLabel,heading,modal,toast,render,run,uid}=H;
 const {pat,resources,field,area,choices,btn,card,row,empty,money,download}=D;
 const s=()=>H.state(),db=()=>H.database(),q=selector=>document.querySelector(selector);
 let ownerKey='',filters=null,tab='overview';
 const ownKey=()=>[s().demo?'demo':'real',s().user?.id||'',s().clinic?.id||'',s().role,H.sessionEpoch?.()??0].join(':');
 const initialFilters=()=>({basis:'due',from:today().slice(0,7)+'-01',to:today().slice(0,7)+'-'+new Date(Number(today().slice(0,4)),Number(today().slice(5,7)),0).getDate(),patient:'',kind:'',status:''});
 function ensureScope(){if(ownerKey!==ownKey()){ownerKey=ownKey();filters=initialFilters();tab='overview';}if(filters.basis==='competency'&&!ledger())filters.basis='due';}
 function context(){return {key:ownKey(),client:db(),clinic:s().clinic?.id,owner:s().demo?'demo':s().user?.id,demo:s().demo,ledgerAvailable:!!ledger()};}
 function ledger(){const value=s().financeLedger;return value?.available&&value.version===1&&value.userId===s().user?.id&&value.clinicId===s().clinic?.id?value:null;}
 async function load(options={}){
  const scope=options.context||{userId:s().user?.id,clinic:s().clinic,patients:s().patients,role:s().role};
  if(s().demo&&!options.context?.userId)return {financeLedger:{available:false}};
  const epoch=H.sessionEpoch?.(),client=db();
  const check=()=>{if(H.sessionEpoch?.()!==epoch||db()!==client||s().user?.id!==scope.userId||(!options.defer&&s().clinic?.id!==scope.clinic?.id))throw Error('A sessão ou a clínica mudou durante a consulta financeira.');};
  const probe=await db().rpc('nutri_finance_capabilities');check();
  if(probe.error){if(['PGRST202','42883'].includes(probe.error.code)){const unavailable={financeLedger:{available:false}};if(!options.defer)s().financeLedger=unavailable.financeLedger;return unavailable;}H.errorCheck(probe);}
  if(probe.data?.version!==1)throw Error('Esta versão do financeiro precisa ser atualizada antes de continuar.');
  const snapshot=H.errorCheck(await db().rpc('nutri_finance_snapshot'));check();
  if(snapshot?.version!==1||!Array.isArray(snapshot.entries)||!Array.isArray(snapshot.events))throw Error('Não foi possível confirmar os dados financeiros.');
  const patientIds=new Set((scope.patients||[]).filter(p=>p.clinic_id===scope.clinic?.id).map(p=>p.id));
  // A professional may also be a patient of another clinic. The server returns
  // all authorized receipts; this workspace shows only the chosen clinic.
  const entries=snapshot.entries.filter(entry=>entry.clinic_id===scope.clinic?.id);
  if(entries.some(entry=>entry.clinic_id!==scope.clinic?.id||(scope.role==='nutri'?entry.owner_id!==scope.userId:entry.kind!=='income'||!patientIds.has(entry.patient_id))))throw Error('Os dados financeiros não correspondem a esta conta.');
  const allIds=new Set(snapshot.entries.map(entry=>entry.id));if(snapshot.events.some(event=>!allIds.has(event.entry_id)))throw Error('O histórico financeiro não corresponde aos lançamentos.');
  const ids=new Set(entries.map(entry=>entry.id)),events=snapshot.events.filter(event=>ids.has(event.entry_id));
  const bundle={finances:entries,financeLedger:{available:true,version:1,userId:scope.userId,clinicId:scope.clinic?.id,events}};
  if(!options.defer){Object.assign(s(),bundle);H.cacheSnapshot();}return bundle;
 }
 async function command(operationId,values,c){
  assertContext(c,true);if(!ledger())throw Error('Atualize o financeiro antes de continuar.');
  const result=H.errorCheck(await db().rpc('nutri_finance_command',{p_operation_id:operationId,p_command:values}));assertContext(c,true);
  if(result?.operation_id!==operationId||!Array.isArray(result.entries)||!result.entries.length||!Array.isArray(result.events))throw Error('O servidor não confirmou a operação financeira. Atualize antes de repetir.');
  if(result.entries.some(entry=>entry.clinic_id!==c.clinic||entry.owner_id!==c.owner))throw Error('A operação não corresponde a esta conta.');
  // A response to an idempotent retry can be older than a later confirmed write.
  const confirmed=new Map(s().finances.map(entry=>[entry.id,entry]));for(const entry of result.entries){const current=confirmed.get(entry.id);if(!current||version(current)<=version(entry))confirmed.set(entry.id,entry);}
  const events=new Map(ledger().events.map(event=>[event.id,event]));for(const event of result.events)events.set(event.id,event);s().finances=[...confirmed.values()];s().financeLedger.events=[...events.values()];H.cacheSnapshot();
 }
 function assertContext(c,write=false){
  if(c.key!==ownKey()||c.client!==db())throw Error('A conta ou a clínica mudou. Abra o lançamento novamente.');
  if(write&&s().role!=='nutri')throw Error('Somente o profissional pode alterar lançamentos.');
  if(write&&c.ledgerAvailable!==!!ledger())throw Error('O financeiro foi atualizado. Abra o lançamento novamente.');
  if(write&&!s().demo&&s().offline)throw Error('Conecte-se à internet para registrar alterações financeiras.');
 }
 function scopedEntries(){
  const owner=s().demo?'demo':s().user?.id,clinic=s().clinic?.id;
  return (s().finances||[]).filter(entry=>entry.clinic_id===clinic&&(s().role==='nutri'?entry.owner_id===owner:entry.kind==='income'&&entry.patient_id===s().selected&&!!pat(entry.patient_id)));
 }
 function find(id,write=false){const c=context();assertContext(c,write);const entry=scopedEntries().find(x=>x.id===id);if(!entry)throw Error('Lançamento indisponível nesta conta.');return structuredClone(entry);}
 function statusLabel(entry){return ({pending:'Pendente',overdue:'Em atraso',partial:'Pago parcialmente',refunded:'Com devolução registrada',paid:entry.kind==='income'?'Recebido':'Pago',void:'Anulado'})[financeStatus(entry,today())];}
 function amount(entry){return money(Number(entry.amount_cents));}
 function selectedEntries(){ensureScope();const f={...filters,kind:tab==='income'?'income':tab==='expense'?'expense':filters.kind};return ledger()&&f.basis==='paid'?financeCashEntries(scopedEntries(),ledger().events,f,today()):filterFinance(scopedEntries(),f,today());}
 function select(label,id,list,value,extra=''){return `<label>${label}<select id="${id}" ${extra}>${list.map(([v,t])=>`<option value="${esc(v)}"${value===v?' selected':''}>${esc(t)}</option>`).join('')}</select></label>`;}
 function controls(){
  return card('Consultar período',`<form id="finance-filters"><div class="form-grid">${select('Data considerada','finance-basis',Object.entries(BASES).filter(([key])=>key!=='competency'||ledger()),filters.basis)}${field('De','finance-from',filters.from,'date')}${field('Até','finance-to',filters.to,'date')}${select('Paciente','finance-patient',[['','Todos os pacientes'],...s().patients.map(p=>[p.id,p.name])],filters.patient)}${select('Situação','finance-status',[['','Em aberto e pagos'],['pending','Pendentes a vencer'],['overdue','Em atraso'],...(ledger()?[['partial','Pagos parcialmente'],['refunded','Com devolução']]:[]),['paid','Pagos'],['void','Anulados'],['all','Todas, incluindo anulados']],filters.status)}${select('Tipo','finance-kind',[['','Receitas e despesas'],['income','Receitas'],['expense','Despesas']],tab==='income'?'income':tab==='expense'?'expense':filters.kind,tab==='income'||tab==='expense'?'disabled':'')}</div><div class="actions"><button class="btn primary" type="submit">Aplicar filtros</button>${btn('Este mês','finance-month','','ghost')}${btn('Todo o período','finance-all','','ghost')}</div><p class="sub">${ledger()?'Competência registra quando o serviço ou a despesa ocorreu; caixa considera os movimentos de pagamento e devolução. Lançamentos sem competência ficam fora deste filtro.':'Competência ainda não está cadastrada. Vencimento e data de pagamento permanecem separados.'}</p></form>`);
 }
 function entriesHTML(list,patient=false){
  if(!list.length)return empty('Nenhum lançamento para os filtros selecionados.');
  return list.map(entry=>row(entry.title,`${pat(entry.patient_id)?.name||'Consultório'} · ${amount(entry)}${entry.installment_count>1?' · parcela '+entry.installment_index+'/'+entry.installment_count:''} · ${statusLabel(entry)} · vence ${dateLabel(entry.due_on)}${entry.ledger_managed?' · saldo '+money(entry._cashOn?scopedEntries().find(x=>x.id===entry.id)?.balance_cents:entry.balance_cents):''}${entry._cashOn?' · caixa líquido neste período '+money(entry.net_paid_cents):entry.paid_on?' · '+(entry.kind==='income'?'recebido':'pago')+' em '+dateLabel(entry.paid_on):''}`,btn('Detalhes','financial-detail',entry.id,'small')+(entry.status==='paid'||Number(entry.received_cents)>0?btn('Recibos','receipt',entry.id,'small'):'')+(!patient&&entry.status==='pending'?btn(entry.kind==='income'?'Registrar recebimento':'Registrar pagamento','financial-paid',entry.id,'small primary'):''))).join('');
 }
 function services(){return card('Serviços e pacotes',`<p class="sub">Condições comerciais do consultório. A quantidade de consultas é independente da forma de pagamento.</p>`+(resources('service').map(service=>row(service.title,`${money(service.data.priceCents)} · ${service.data.sessions||1} consultas · validade ${service.data.intervalDays||30} dias`,btn('Editar','resource-edit',service.id,'small')+btn('Atribuir','subscribe',service.id,'small'))).join('')||empty('Cadastre o primeiro serviço.')),btn('+ Serviço','resource-new','service','small'));}
 function subscriptions(patient=false){
  const patientId=patient?s().selected:filters.patient;
  const list=(s().records||[]).filter(record=>record.kind==='subscription'&&!record.data?.archived&&(!patientId||record.patient_id===patientId)&&!!pat(record.patient_id)&&(s().demo||record.clinician_id===(patient?pat(record.patient_id)?.clinician_id:s().user?.id)));
  return card(patient?'Meu acompanhamento comercial':'Acompanhamentos comerciais',`<p class="sub">As condições são copiadas ao atribuir o serviço. A atribuição não gera cobrança automática ou saldo de consultas.</p>`+(list.map(record=>{
   let link='';try{const url=new URL(record.data.link);if(url.protocol==='https:')link=url.href;}catch{}
   return row(record.title,`${pat(record.patient_id)?.name||''} · ${money(record.data.priceCents)} · ${record.data.sessions||1} consultas · início ${dateLabel(record.data.startOn)} · versão ${record.version||1}`,btn('Condições','record-detail',record.id,'small')+(patient&&link?`<a class="btn small" href="${esc(link)}" target="_blank" rel="noopener noreferrer">Link externo</a>`:''));
  }).join('')||empty('Nenhum acompanhamento comercial atribuído.'))+(patient?'<p class="sub">Abrir um link externo não confirma o pagamento no aplicativo.</p>':''),patient?'':btn('Atribuir serviço','subscribe','','small'));
 }
 function view(){
  ensureScope();if(s().role!=='nutri')return payments();const list=selectedEntries(),t=financeTotals(list);
  const tabs=[['overview','Visão geral'],['income','Recebimentos'],['services','Serviços e pacotes'],['subscriptions','Acompanhamentos'],['expense','Despesas']];
  const top=heading('Gestão do consultório','Financeiro','Registros administrativos de receitas e despesas.',`<div class="actions">${btn('+ Receita','financial-new','income')}${btn('+ Despesa','financial-new','expense')}${!['services','subscriptions'].includes(tab)?btn('Exportar seleção','export-finance'):''}</div>`)+`<div class="tabs" aria-label="Áreas financeiras">${tabs.map(([id,title])=>`<button class="btn ${tab===id?'primary':''}" data-finance-tab="${id}" aria-pressed="${tab===id}">${title}</button>`).join('')}</div>`;
  if(tab==='services')return wrap(top+services());if(tab==='subscriptions')return wrap(top+select('Paciente','finance-subscription-patient',[['','Todos os pacientes'],...s().patients.map(p=>[p.id,p.name])],filters.patient)+subscriptions());
  return wrap(top+controls()+`<div class="stats">${[[money(t.incomePaid),ledger()?'Receitas líquidas de devoluções':'Receitas pagas'],[money(t.incomePending),'Receitas pendentes'],[money(t.expensePaid),ledger()?'Despesas líquidas de devoluções':'Despesas pagas'],[money(t.expensePending),'Despesas pendentes'],[money(t.balance),filters.basis==='paid'?'Saldo de caixa no período':'Saldo dos lançamentos pagos']].map(([v,n])=>`<div class="stat"><span class="stat-label">${n}</span><div class="stat-num">${v}</div></div>`).join('')}</div><p class="sub">${filters.basis==='paid'?'Caixa considera os movimentos na data em que ocorreram. Valores ainda não pagos ficam fora desta consulta.':filters.basis==='competency'?'Totais dos lançamentos com competência informada no período; pagamentos podem ter ocorrido em outra data.':'Totais dos lançamentos com vencimento no período; pagamentos podem ter ocorrido em outra data.'} ${t.voidCount?`${t.voidCount} lançamento(s) anulado(s) fora dos totais.`:''}</p>`+card(`${list.length} lançamento(s)`,entriesHTML(list))+`<p class="sub">Baixas manuais exigem conferência do recebimento ou pagamento. O aplicativo não movimenta dinheiro.</p>`);
 }
 const wrap=html=>'<div class="finance-workspace">'+html+'</div>';
 function payments(){return wrap(heading('Meu acompanhamento','Pagamentos','Recebimentos informados pelo consultório.')+card('Consultas e acompanhamento',entriesHTML(scopedEntries().filter(entry=>entry.status!=='void'),true))+subscriptions(true));}
 function form(kind,existing){
  const c=context();assertContext(c,true);if(!['income','expense'].includes(kind))throw Error('Tipo de lançamento inválido.');
  if(existing&&(existing.status==='void'||(!ledger()&&existing.status!=='pending')))throw Error('Este lançamento não pode ser corrigido.');
  const entryId=existing?.id,operationId=uid(),snapshot=existing?structuredClone(existing):null;let legacyAttempted=false;
  const method=existing?.method||'pix';
  modal(existing?'Corrigir lançamento':kind==='income'?'Nova receita':'Nova despesa',`${kind==='income'&&!existing?choices():''}${existing?`<p>${esc(pat(existing.patient_id)?.name||'Consultório')} · versão ${existing.version||1}</p>`:''}${field('Descrição','x-title',existing?.title||'','text','required maxlength="200"')}<div class="form-grid">${field('Valor total (R$)','x-amount',existing?Number(existing.amount_cents)/100:'','number','min="0.01" max="10000000" step="0.01" required')}${field('Vencimento','x-due',existing?.due_on||today(),'date','required')}${ledger()?field('Competência (opcional)','finance-competency',existing?.competency_on||'','date')+(existing?'':field('Número de parcelas','finance-installments',1,'number','min="1" max="60" step="1" required')):''}</div>${ledger()&&!existing?'<p class="sub">Parcelas mensais dividem o valor total. O último dia de cada mês é respeitado; confira o calendário abaixo antes de salvar.</p><div id="finance-installment-preview" aria-live="polite"></div>':''}${select('Forma de pagamento','x-method',Object.entries(METHODS),method)}${area(kind==='income'?'Observação compartilhada com o paciente':'Observação administrativa','x-note',existing?.note||'','maxlength="4000"')}${kind==='income'?'<p class="sub">O paciente tem acesso a esta observação. Registre somente informações de cobrança, sem dados clínicos.</p>':''}${existing?area('Motivo da correção'+(!ledger()&&kind==='income'?' (visível ao paciente)':''),'x-reason','','required maxlength="500"'):''}`,async()=>{
   assertContext(c,true);const due=q('#x-due').value,title=q('#x-title').value.trim(),note=q('#x-note').value.trim();
   if(!title||title.length>200)throw Error('Informe uma descrição de até 200 caracteres.');if(!validFinanceDay(due))throw Error('Informe um vencimento válido.');
   const values={title,amount_cents:moneyCents(q('#x-amount').value),due_on:due,method:q('#x-method').value,note};
   if(!Object.hasOwn(METHODS,values.method))throw Error('Escolha uma forma de pagamento.');
   const reason=existing?q('#x-reason').value.trim():'';if(existing){if(!reason||reason.length>500)throw Error('Informe o motivo da correção, até 500 caracteres.');if(!ledger())values.note=[note,'Correção: '+reason].filter(Boolean).join('\n');}
   if(values.note.length>4000)throw Error('A observação e o motivo devem somar até 4.000 caracteres.');
   if(ledger()){
    const competency=q('#finance-competency').value;if(competency&&!validFinanceDay(competency))throw Error('Informe uma competência válida.');values.competency_on=competency||null;
    if(existing)await command(operationId,{action:'correct',entry_id:entryId,expected_version:version(snapshot),...values,reason},c);
    else{const patientId=kind==='income'?q('#x-patient')?.value:null;if(kind==='income'&&!s().patients.some(p=>p.id===patientId))throw Error('Selecione um paciente cadastrado.');const installments=installmentAmounts(values.amount_cents,Number(q('#finance-installments').value)).map((amount_cents,index)=>({amount_cents,due_on:installmentDay(due,index),competency_on:competency||null}));await command(operationId,{action:'create',clinic_id:c.clinic,patient_id:patientId,kind,...values,installments},c);}
   }else if(existing)await update(snapshot,values,c);else{
    const patientId=kind==='income'?q('#x-patient')?.value:null;if(kind==='income'&&!s().patients.some(p=>p.id===patientId))throw Error('Selecione um paciente cadastrado.');
    if(legacyAttempted)throw Error('Este envio já foi tentado. Atualize o financeiro e confira a lista antes de criar outro lançamento.');legacyAttempted=true;
    await insert({clinic_id:c.clinic,owner_id:c.owner,patient_id:patientId,kind,...values,status:'pending',paid_on:null},c);
   }render();toast(existing?'Correção registrada.':'Lançamento registrado.');
  });
  if(ledger()&&!existing){const preview=()=>{try{const amounts=installmentAmounts(moneyCents(q('#x-amount').value),Number(q('#finance-installments').value));q('#finance-installment-preview').innerHTML=amounts.map((value,index)=>`<p class="sub">${index+1}/${amounts.length} · ${money(value)} · ${dateLabel(installmentDay(q('#x-due').value,index))}</p>`).join('');}catch{q('#finance-installment-preview').textContent='Informe valor, vencimento e número de parcelas para conferir.';}};for(const id of ['x-amount','x-due','finance-installments'])q('#'+id).oninput=preview;preview();}
 }
 function version(entry){const v=entry.version??(s().demo?1:null);if(!Number.isInteger(v)||v<1)throw Error('Atualize os lançamentos antes de continuar.');return v;}
 function commitConfirmed(entry,c){assertContext(c,true);const index=s().finances.findIndex(x=>x.id===entry.id);if(index<0)s().finances.push(entry);else s().finances[index]=entry;H.cacheSnapshot();}
 async function insert(payload,c){
  assertContext(c,true);if(c.demo){commitConfirmed({id:uid(),...payload,version:1,created_at:new Date().toISOString(),updated_at:new Date().toISOString()},c);return;}
  const response=await db().from('financial_entries').insert(payload).select('*');assertContext(c,true);
  const rows=H.errorCheck(response);
  if(!Array.isArray(rows)||rows.length!==1||!rows[0].id||rows[0].clinic_id!==c.clinic||rows[0].owner_id!==c.owner)throw Error('O servidor não confirmou o lançamento. Atualize o financeiro e confira a lista antes de tentar novamente.');
  commitConfirmed(rows[0],c);
 }
 async function update(snapshot,changes,c){
  assertContext(c,true);const expectedVersion=version(snapshot);
  if(snapshot.status!=='pending')throw Error('Este lançamento já não está pendente. Atualize os dados.');
  let confirmed;
  if(c.demo){const current=scopedEntries().find(x=>x.id===snapshot.id);if(!current||version(current)!==expectedVersion||current.status!==snapshot.status)throw Error('Este lançamento mudou em outra sessão. Atualize antes de continuar.');confirmed={...current,...changes,version:expectedVersion+1,updated_at:new Date().toISOString()};}
  else{
   const rows=H.errorCheck(await db().from('financial_entries').update(changes).eq('id',snapshot.id).eq('clinic_id',c.clinic).eq('owner_id',c.owner).eq('version',expectedVersion).eq('status',snapshot.status).select('*'));
   assertContext(c,true);if(!Array.isArray(rows)||rows.length!==1||rows[0].id!==snapshot.id)throw Error('Nenhum lançamento foi alterado. Ele pode ter mudado em outra sessão ou o acesso mudou. Atualize antes de continuar.');confirmed=rows[0];
  }commitConfirmed(confirmed,c);
 }
 function paid(entry){
  const c=context();assertContext(c,true);if(entry.status!=='pending')throw Error('O lançamento já não está pendente.');
  const operationId=uid(),remaining=ledger()?Number(entry.balance_cents):Number(entry.amount_cents);
  modal(entry.kind==='income'?'Registrar recebimento manual':'Registrar pagamento manual',`<p>${esc(entry.title)} · saldo ${money(remaining)}</p>${ledger()?field('Valor recebido / pago (R$)','finance-paid-amount',remaining/100,'number','min="0.01" max="'+remaining/100+'" step="0.01" required')+select('Forma do pagamento','finance-paid-method',Object.entries(METHODS),entry.method||'pix'):''}${field(entry.kind==='income'?'Data do recebimento':'Data do pagamento','x-paid',today(),'date','required max="'+today()+'"')}<label class="check-label"><input id="finance-confirm-paid" type="checkbox" required> Conferi o pagamento ${ledger()?'do valor informado':'de '+amount(entry)}.</label><p class="sub">${ledger()?'Recebimentos parciais preservam o saldo restante.':'Esta baixa registra o valor integral.'} Não cobra, transfere ou confirma uma transação bancária automaticamente.</p>`,async()=>{
   assertContext(c,true);const day=q('#x-paid').value;if(!validFinanceDay(day)||day>today())throw Error('Informe a data em que o pagamento ocorreu, até hoje.');if(!q('#finance-confirm-paid').checked)throw Error('Confirme que conferiu o pagamento.');
   if(ledger()){const value=moneyCents(q('#finance-paid-amount').value);if(value>remaining)throw Error('O pagamento não pode superar o saldo.');await command(operationId,{action:'pay',entry_id:entry.id,expected_version:version(entry),amount_cents:value,occurred_on:day,method:q('#finance-paid-method').value,reason:''},c);}
   else await update(entry,{status:'paid',paid_on:day},c);render();toast('Baixa manual registrada.');
  });
 }
 function cancel(entry){
  const c=context(),operationId=uid();assertContext(c,true);if(entry.status!=='pending'||Number(entry.received_cents)>0)throw Error('Somente lançamentos sem pagamentos podem ser anulados. Uma devolução precisa de registro próprio.');
  modal('Anular lançamento pendente',`<p>${esc(entry.title)} · ${amount(entry)}</p>${area('Motivo da anulação'+(entry.kind==='income'?' (visível ao paciente)':''),'x-reason','','required maxlength="500"')}<p class="sub">O lançamento continuará no histórico, fora dos totais. Esta ação não devolve dinheiro nem cancela uma consulta.</p>`,async()=>{
   assertContext(c,true);const reason=q('#x-reason').value.trim();if(!reason||reason.length>500)throw Error('Informe o motivo da anulação, até 500 caracteres.');const note=[entry.note,'Anulação: '+reason].filter(Boolean).join('\n');if(note.length>4000)throw Error('A observação e o motivo devem somar até 4.000 caracteres.');
   if(ledger())await command(operationId,{action:'void',entry_id:entry.id,expected_version:version(entry),reason},c);else await update(entry,{status:'void',paid_on:null,note},c);render();toast('Lançamento anulado; histórico preservado.');
  });
 }
 function refund(entry){
  const c=context(),operationId=uid();assertContext(c,true);const maximum=Number(entry.net_paid_cents);if(!ledger()||maximum<=0)throw Error('Não há valor pago disponível para devolver.');
  modal('Registrar devolução já realizada',`<p>${esc(entry.title)} · disponível para devolução ${money(maximum)}</p>${field('Valor devolvido (R$)','finance-refund-amount',maximum/100,'number','min="0.01" max="'+maximum/100+'" step="0.01" required')}${field('Data da devolução','finance-refund-day',today(),'date','required max="'+today()+'"')}${select('Forma da devolução','finance-refund-method',Object.entries(METHODS),entry.method||'pix')}${area('Motivo administrativo','finance-refund-reason','','required maxlength="500"')}<label class="check-label"><input id="finance-confirm-refund" type="checkbox" required> Conferi a devolução realizada fora do aplicativo.</label><p class="sub">Este registro não movimenta dinheiro, não executa estorno de cartão e não reabre a dívida. A consulta e o acompanhamento comercial permanecem separados.</p>`,async()=>{
   assertContext(c,true);const amount=moneyCents(q('#finance-refund-amount').value),day=q('#finance-refund-day').value,reason=q('#finance-refund-reason').value.trim();
   if(amount>maximum)throw Error('A devolução supera o valor recebido ainda disponível.');if(!validFinanceDay(day)||day>today())throw Error('Informe a data em que a devolução ocorreu, até hoje.');if(!reason||reason.length>500)throw Error('Informe o motivo, até 500 caracteres.');if(!q('#finance-confirm-refund').checked)throw Error('Confirme que conferiu a devolução.');
   await command(operationId,{action:'refund',entry_id:entry.id,expected_version:version(entry),amount_cents:amount,occurred_on:day,method:q('#finance-refund-method').value,reason},c);render();toast('Devolução manual registrada.');
  });
 }
 function details(entry){
  const advanced=!!ledger(),editable=entry.status!=='void'&&(advanced||entry.status==='pending'),canVoid=entry.status==='pending'&&!Number(entry.received_cents);
  modal('Lançamento administrativo',`<div class="document-text"><h3>${esc(entry.title)}</h3><p>${esc(pat(entry.patient_id)?.name||'Consultório')} · ${amount(entry)} · ${statusLabel(entry)}</p><p>Vencimento: ${dateLabel(entry.due_on)}${advanced?'<br>Competência: '+(entry.competency_on?dateLabel(entry.competency_on):'Não informada')+'<br>Recebido / pago: '+money(entry.received_cents)+' · devolvido: '+money(entry.refunded_cents)+' · saldo: '+money(entry.balance_cents):''}${entry.paid_on?'<br>Pagamento informado: '+dateLabel(entry.paid_on):''}<br>Forma: ${esc(METHODS[entry.method]||entry.method||'Não informada')}</p>${entry.note?'<h3>Observação'+(entry.kind==='income'?' compartilhada':'')+'</h3><p>'+esc(entry.note)+'</p>':''}<p class="sub">Registro ${esc(entry.id)} · versão ${version(entry)}</p></div><div class="actions">${s().role==='nutri'?(editable?btn('Corrigir','financial-edit',entry.id):'')+(canVoid?btn('Anular','financial-void',entry.id,'ghost'):'')+(advanced&&Number(entry.net_paid_cents)>0?btn('Registrar devolução','financial-refund',entry.id,'ghost'):''):''}${entry.status==='paid'||Number(entry.received_cents)>0?btn('Recibos','receipt',entry.id):''}</div>${advanced?eventRows(entry):''}`);D.bind();
 }
 const hasReceipt=event=>['payment','refund'].includes(event.kind)||(event.kind==='opening'&&Number(event.amount_cents)>0);
 function eventRows(entry){return card('Histórico administrativo',ledger().events.filter(event=>event.entry_id===entry.id).slice().sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).map(event=>row(({payment:'Pagamento manual',refund:'Devolução manual',void:'Anulação',correction:'Correção',create:'Lançamento criado',opening:'Registro anterior à conciliação'})[event.kind]||'Registro',`${dateLabel(event.occurred_on||String(event.created_at).slice(0,10))} · versão ${event.entry_version}${Number(event.amount_cents)>0?' · '+money(event.amount_cents):''}${event.reason?' · '+event.reason:''}`,hasReceipt(event)?btn(event.kind==='opening'?'Registro legado':'Comprovante','finance-event-receipt',event.id,'small'):'')).join('')||empty('Nenhum movimento.'));}
 function eventReceipt(eventId,print=false){
  const event=ledger()?.events.find(item=>item.id===eventId);if(!event||!hasReceipt(event)||!scopedEntries().some(entry=>entry.id===event.entry_id))throw Error('Comprovante indisponível nesta conta.');
  const snapshot=event.entry_snapshot||{},html=`<div class="document-text"><h2>${esc(snapshot.clinic_name)}</h2><h3>${event.kind==='opening'?'Registro legado de pagamento':event.kind==='refund'?'Registro de devolução manual':'Recibo de pagamento manual'}</h3><p>${esc(snapshot.patient_name||'Consultório')}</p><p>${esc(snapshot.title)} · ${money(event.amount_cents)}</p><p>Data: ${dateLabel(event.occurred_on)} · ${esc(METHODS[event.method]||event.method)}</p><p>${esc(snapshot.professional_name)} · ${esc(snapshot.crn)}</p><p>Referência: ${esc(event.id)} · lançamento ${esc(event.entry_id)} · versão ${event.entry_version}</p><p class="sub">${event.kind==='opening'?'Pagamento anterior à conciliação, preservado como registro legado. Esta consulta não registra uma nova baixa.':'Condições preservadas no registro deste movimento.'} Registro administrativo; não é documento fiscal nem confirmação bancária.</p></div>`;
  if(!print){modal('Comprovante administrativo',html+btn('Imprimir / salvar PDF','finance-event-print',event.id));D.bind();return;}printHTML(html);
 }
 function receiptHTML(entry){
  if(entry.status!=='paid'||!validFinanceDay(entry.paid_on))throw Error('O recibo exige um lançamento pago.');
  return `<div class="document-text"><h2>${esc(s().clinic.name)}</h2><h3>${entry.kind==='income'?'Recibo de recebimento':'Registro de despesa paga'}</h3><p>${esc(pat(entry.patient_id)?.name||'Consultório')}</p><p>${esc(entry.title)} · ${amount(entry)}</p><p>Pagamento informado em ${dateLabel(entry.paid_on)} · ${esc(METHODS[entry.method]||entry.method||'Não informado')}</p><p>${esc(s().clinic.professional_name)} · ${esc(s().clinic.crn)}</p><p>Referência: ${esc(entry.id)} · versão ${version(entry)}</p><p class="sub">Registro administrativo emitido em ${dateLabel(today())}. Não é documento fiscal nem confirmação bancária. Valores informados pelo consultório.</p></div>`;
 }
 function receipt(entry,print=false){
  if(ledger()){const events=ledger().events.filter(event=>event.entry_id===entry.id&&hasReceipt(event));if(!events.length)throw Error('Não há comprovante de pagamento registrado para este lançamento.');if(print&&events.length===1)return eventReceipt(events[0].id,true);modal('Recibos e devoluções',eventRows(entry));D.bind();return;}
  const html=receiptHTML(entry);if(!print){modal('Recibo administrativo',html+btn('Imprimir / salvar PDF','receipt-print',entry.id));D.bind();return;}
  printHTML(html);
 }
 function printHTML(html){const win=window.open('','_blank');if(!win)throw Error('Permita abrir a janela de impressão.');win.opener=null;win.onload=()=>win.print();win.document.write('<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Recibo administrativo</title><style>body{font:18px system-ui;max-width:740px;margin:40px auto;padding:20px;line-height:1.8;color:#17212f;overflow-wrap:anywhere}.sub{font-size:14px}</style></head><body>'+html+'</body></html>');win.document.close();}
 function exportCSV(){
  assertContext(context());if(s().role!=='nutri')throw Error('Exportação disponível ao profissional.');const rows=[['ID','Versão','Descrição','Paciente','Tipo','Valor total (R$)','Vencimento','Competência','Pagamento','Situação','Forma','Base do período','Pago líquido (R$)','Saldo pendente (R$)'],...selectedEntries().map(entry=>[entry.id,version(entry),entry.title,pat(entry.patient_id)?.name||'',entry.kind==='income'?'Receita':'Despesa',(Number(entry.amount_cents)/100).toFixed(2).replace('.',','),entry.due_on,entry.competency_on||'',entry.paid_on||'',statusLabel(entry),METHODS[entry.method]||entry.method,BASES[filters.basis],entry.ledger_managed?(Number(entry.net_paid_cents)/100).toFixed(2).replace('.',','):'',entry.ledger_managed?(Number(entry.balance_cents)/100).toFixed(2).replace('.',','):''])];
  download('financeiro-'+today()+'.csv',safeFinanceCSV(rows),'text/csv;charset=utf-8');
 }
 const actions=new Set(['financial-new','financial-paid','financial-edit','financial-void','financial-refund','financial-detail','receipt','receipt-print','finance-event-receipt','finance-event-print','export-finance','finance-month','finance-all']);
 async function act(action,id){
  ensureScope();if(action==='financial-new')return form(id);if(action==='export-finance')return exportCSV();
  if(action==='finance-event-receipt'||action==='finance-event-print')return eventReceipt(id,action==='finance-event-print');
  if(action==='finance-month'){filters={...filters,...initialFilters(),patient:filters.patient};return render();}if(action==='finance-all'){filters.from='';filters.to='';return render();}
  const entry=find(id,['financial-paid','financial-edit','financial-void','financial-refund'].includes(action));
  if(action==='financial-paid')return paid(entry);if(action==='financial-edit')return form(entry.kind,entry);if(action==='financial-void')return cancel(entry);if(action==='financial-refund')return refund(entry);if(action==='financial-detail')return details(entry);if(action==='receipt'||action==='receipt-print')return receipt(entry,action==='receipt-print');
 }
 function bind(){
  document.querySelectorAll('[data-finance-tab]').forEach(button=>button.onclick=()=>{ensureScope();tab=button.dataset.financeTab;render();});
  if(q('#finance-subscription-patient'))q('#finance-subscription-patient').onchange=()=>{ensureScope();filters.patient=q('#finance-subscription-patient').value;render();};
  const form=q('#finance-filters');if(form)form.onsubmit=event=>{event.preventDefault();run(()=>{
   const from=q('#finance-from').value,to=q('#finance-to').value;if((from&&!validFinanceDay(from))||(to&&!validFinanceDay(to)))throw Error('Informe datas válidas para o período.');if(from&&to&&from>to)throw Error('A data inicial deve ser anterior à final.');
   filters={basis:q('#finance-basis').value,from,to,patient:q('#finance-patient').value,status:q('#finance-status').value,kind:q('#finance-kind').value};render();
  });};
 }
 function openPatient(id){ensureScope();if(s().role!=='nutri'||!pat(id))throw Error('Paciente indisponível.');filters={...initialFilters(),from:'',to:'',patient:id};tab='income';s().selected=id;s().page='finance';render();}
 return {view,payments,bind,act,matches:action=>actions.has(action),openPatient,load};
}
