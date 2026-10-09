import {resolveJournalPlan,buildJournalItems,findJournalForMeal} from './journal-model.js';

// One entry flow for the home, plan and diary. It only writes save_food_journal;
// explicit plan adherence continues to use record_log_once independently.
export function createFoodJournal(H,{pat,records,saveRecord,load,imageFile}){
 const {state,esc,uid,today,modal,toast,render}=H;
 const s=()=>state(),q=sel=>document.querySelector(sel);
 const itemRow=source=>({...source.id?{id:source.id}:{},nome:source.nome||'',qtd:source.qtd??1,porcao:source.porcao||'',source:structuredClone(source)});
 const blank=()=>({id:uid(),nome:'',qtd:1,porcao:'',source:null});
 function forMeal(mealId){
  if(s().role!=='patient'||!pat())throw Error('Entre no acompanhamento do paciente.');
  const published=H.published(),meal=published?.data?.refeicoes?.find(x=>x.id===mealId);
  if(!meal)throw Error('Esta refeição não está no plano publicado. Atualize o plano.');
  if(!navigator.onLine&&!s().demo){
   const marked=H.logs(pat()).find(x=>x.day===today())?.meals?.includes(mealId);
   return modal('Refeição sem conexão',`<p>${esc(meal.titulo)}</p><p class="sub">Você pode guardar uma marcação simples neste aparelho agora e completar os alimentos e porções no diário ao reconectar.</p><label class="check-label"><input id="journal-offline-confirm" type="checkbox" required> ${marked?'Quero remover a marcação simples de hoje.':'Confirmo que registrei esta refeição hoje.'}</label>`,async()=>{await H.saveLog({mealId,completed:!marked});toast('Marcação guardada no aparelho para sincronizar.');});
  }
  const pendingKey=`torque-nutri-journal-pending:${s().user?.id||'demo'}:${pat().id}:new`;
  // A successful insert followed by a failed refresh may already be present in
  // the cache. Resolve its pending operation before opening another record.
  if(sessionStorage.getItem(pendingKey))return open(null,mealId);
  return open(findJournalForMeal({records:s().records,patientId:pat().id,day:today(),mealId,planVersion:published.version}),mealId);
 }
 function open(existing,initialMealId=null){
  if(s().role!=='patient'||!pat())throw Error('Este diário pertence ao paciente.');
  const patientId=pat().id,accountId=s().user?.id||'demo';
  const reference=resolveJournalPlan({published:H.published(),records:s().records,patientId,existing});
  const meals=reference.plan?.refeicoes||[],opKey=`torque-nutri-journal-pending:${accountId}:${patientId}:${existing?.id||'new'}`;
  const draftKey=`torque-nutri-journal-draft:${accountId}:${patientId}:${existing?.id||'new:'+String(initialMealId||'manual')}`;
  let attempt=null,draft=null;try{attempt=JSON.parse(sessionStorage.getItem(opKey)||'null');draft=JSON.parse(sessionStorage.getItem(draftKey)||'null');}catch{}
  // Pending arguments are immutable until the RPC outcome and refreshed data are
  // known. This also keeps a retried report pinned to its original plan version.
  if(attempt&&(attempt.p_patient_id!==patientId||attempt.p_record_id!==(existing?.id||null)))throw Error('Envio pendente indisponível para este registro.');
  const d=attempt?.p_data||existing?.data||{};
  let selectedId=existing?reference.mealId:(attempt?d.mealId:initialMealId||draft?.mealId||null);
  if(draft&&(draft.mealId!==selectedId||draft.planVersion!==reference.planVersion||draft.recordVersion!==(existing?.version||null)))draft=null;
  let rows=(d.items?.length?d.items.map((item,sourceIndex)=>({...itemRow(item),sourceIndex})):!existing&&meals.find(x=>x.id===selectedId)?.itens?.map(itemRow))||[blank()];
  if(!attempt&&draft?.rows&&draft.mealId===selectedId&&draft.planVersion===reference.planVersion&&draft.recordVersion===(existing?.version||null)){
   const sources=[...(d.items||[]),...meals.flatMap(x=>(x.itens||[]).flatMap(it=>[it,...(it.substituicoes||[])]))];
   rows=draft.rows.map(x=>({...x,source:sources.find(source=>source.id!==undefined&&source.id===x.id)||(existing&&x.id===undefined&&Number.isInteger(x.sourceIndex)?d.items?.[x.sourceIndex]:null)||null}));
  }
  const selected=()=>meals.find(x=>x.id===selectedId);
  const historicalTitle=existing?.title||'Refeição registrada';
  const mealOptions=`<option value="">Registro fora do plano</option>${meals.map(x=>`<option value="${esc(x.id)}" ${selectedId===x.id?'selected':''}>${esc(x.titulo)}</option>`).join('')}${selectedId&&!selected()?`<option value="${esc(selectedId)}" selected>${esc(historicalTitle)} · referência histórica</option>`:''}`;
  const oldMeal=existing&&!selected();
  const initialTitle=attempt?.p_title||draft?.title||existing?.title||selected()?.titulo||'Minha refeição';
  modal(existing?'Revisar minha refeição':'Registrar minha refeição',`
   ${attempt?'<div class="notice">Há um envio aguardando confirmação. Salvar confere a mesma operação com os dados originais.</div>':''}
   ${oldMeal?'<p class="sub">Esta refeição pertence a um plano anterior. A referência histórica será preservada.</p>':''}
   <div class="form-grid"><label>Data<input id="journal-day" type="date" value="${esc(attempt?d.day:draft?.day||d.day||today())}" max="${today()}" required></label><label>Refeição<select id="journal-meal" ${existing?'disabled':''}>${mealOptions}</select></label></div>
   <label>Nome do registro<input id="journal-title" value="${esc(initialTitle)}" maxlength="200" required></label>
   ${!existing?`<label>Como foi esta refeição?<select id="journal-how" required><option value="planned">Fiz como planejado</option><option value="substitution">Usei uma substituição</option><option value="different" ${!selectedId?'selected':''}>Foi diferente do plano</option></select></label>`:''}
   <p class="sub">Confira o que consumiu. Você pode ajustar quantidades, usar as substituições da sua nutri ou informar outros alimentos.</p>
   <div id="journal-items" class="journal-items"></div><button class="btn ghost" type="button" id="journal-add">+ Outro alimento</button>
   <label class="check-label"><input id="journal-confirm" type="checkbox" required> Conferi os alimentos e as quantidades que consumi.</label>
   <label>Observação (opcional)<textarea id="journal-note" maxlength="3800">${esc(attempt?d.note:draft?.note??d.note??'')}</textarea></label>
   <label>Foto (opcional)<input id="journal-image" type="file" accept="image/png,image/jpeg,image/webp"></label>
   <p class="sub">Este registro compartilha seu relato com a nutri. A confirmação “Segui meu plano” continua sendo sua escolha na tela do dia. Salve com conexão; o rascunho de texto fica neste aparelho.</p>`,submit);
  if(draft?.how&&!attempt&&!existing)q('#journal-how').value=draft.how;
  function capture(){
   rows.forEach((row,index)=>{const el=q(`[data-journal-row="${index}"]`);if(!el)return;row.nome=el.querySelector('[data-journal-name]').value;row.qtd=el.querySelector('[data-journal-quantity]').value;row.porcao=el.querySelector('[data-journal-portion]').value;});
  }
  function saveDraft(){if(attempt)return;capture();sessionStorage.setItem(draftKey,JSON.stringify({day:q('#journal-day').value,mealId:selectedId,planVersion:reference.planVersion,recordVersion:existing?.version||null,title:q('#journal-title').value,how:q('#journal-how')?.value,note:q('#journal-note').value,rows:rows.map(({source,...row})=>row)}));}
  function draw(){
   q('#journal-items').innerHTML=rows.map((row,index)=>{
    const planItem=selected()?.itens?.find(x=>x.id===row.id)||selected()?.itens?.find(x=>x.substituicoes?.some(a=>a.id===row.id));
    const alternatives=planItem?[planItem,...(planItem.substituicoes||[])]:[];
    return `<fieldset data-journal-row="${index}" class="journal-food"><legend>Alimento ${index+1}</legend>${alternatives.length>1?`<label>Opções prescritas<select data-journal-alternative="${index}">${alternatives.map((x,i)=>`<option value="${i}" ${x.id===row.id?'selected':''}>${esc(x.nome)} · ${esc(x.porcao)}</option>`).join('')}</select></label>`:''}<label>Alimento<input data-journal-name value="${esc(row.nome)}" maxlength="200" required></label><div class="form-grid"><label>Quantidade de porções<input data-journal-quantity type="number" min="0.01" max="1000" step="any" value="${esc(row.qtd)}" required></label><label>Medida de cada porção<input data-journal-portion value="${esc(row.porcao)}" maxlength="100" placeholder="Ex.: 100 g ou 1 unidade" required></label></div><button type="button" class="btn small ghost" data-journal-remove="${index}" aria-label="Remover alimento ${index+1}">Remover alimento</button></fieldset>`;
   }).join('');
   q('#journal-items').querySelectorAll('[data-journal-remove]').forEach(b=>b.onclick=()=>{capture();rows.splice(Number(b.dataset.journalRemove),1);if(q('#journal-how'))q('#journal-how').value='different';q('#journal-confirm').checked=false;draw();saveDraft();});
   q('#journal-items').querySelectorAll('[data-journal-alternative]').forEach(el=>el.onchange=()=>{capture();const index=Number(el.dataset.journalAlternative),base=selected()?.itens?.find(x=>x.id===rows[index].id||x.substituicoes?.some(a=>a.id===rows[index].id));if(!base)return;rows[index]=itemRow([base,...(base.substituicoes||[])][Number(el.value)]);if(q('#journal-how'))q('#journal-how').value='substitution';draw();saveDraft();});
  }
  function lock(){q('#modal-form').querySelectorAll('input,textarea,select,button[type="button"]').forEach(el=>{if(el.id==='cancel-modal')return;delete el.dataset.busyLock;el.disabled=true;});q('#modal-form button[type="submit"]').textContent='Conferir envio';}
  q('#journal-add').onclick=()=>{capture();if(rows.length>=100){toast('Use até 100 alimentos por registro.');return;}rows.push(blank());if(q('#journal-how'))q('#journal-how').value='different';q('#journal-confirm').checked=false;draw();saveDraft();};
  q('#journal-meal').onchange=()=>{selectedId=q('#journal-meal').value||null;rows=selected()?.itens?.map(itemRow)||[blank()];q('#journal-title').value=selected()?.titulo||'Minha refeição';if(q('#journal-how'))q('#journal-how').value=selectedId?'planned':'different';q('#journal-confirm').checked=false;draw();saveDraft();};
  if(q('#journal-how'))q('#journal-how').onchange=()=>{capture();if(q('#journal-how').value==='planned'&&selected()){rows=selected().itens.map(itemRow);draw();}q('#journal-confirm').checked=false;saveDraft();};
  q('#modal-form').addEventListener('input',event=>{if(event.target.matches('[data-journal-name],[data-journal-portion],[data-journal-quantity]')){if(q('#journal-how'))q('#journal-how').value='different';q('#journal-confirm').checked=false;}saveDraft();});draw();if(attempt)lock();
  async function submit(){
   if((s().user?.id||'demo')!==accountId||s().selected!==patientId)throw Error('A sessão mudou. Abra o diário novamente.');
   if(!navigator.onLine&&!s().demo)throw Error('Conecte-se para salvar. Seu rascunho de texto está guardado.');
   const before=H.stats(pat()).xp;
   if(!attempt){
    capture();if(!q('#journal-confirm').checked)throw Error('Confira os alimentos e confirme as quantidades consumidas.');
    const items=buildJournalItems(rows),note=q('#journal-note').value.trim(),how=q('#journal-how')?.selectedOptions[0]?.textContent;
    const data={day:q('#journal-day').value,mealId:existing?reference.mealId:selectedId,items,note:how?`Como foi: ${how}.\n${note}`.trim():note,image:q('#journal-image').files[0]?await imageFile(q('#journal-image').files[0]):d.image||null,planVersion:reference.planVersion};
    if(new TextEncoder().encode(JSON.stringify(data)).length>350000)throw Error('Este registro ficou grande. Reduza a foto ou a observação.');
    attempt={p_operation_id:uid(),p_patient_id:patientId,p_record_id:existing?.id||null,p_expected_version:existing?.version||null,p_title:q('#journal-title').value.trim(),p_data:data};
    if(!s().demo)sessionStorage.setItem(opKey,JSON.stringify(attempt));
   }
   if(s().demo){await saveRecord('food_journal',attempt.p_title,attempt.p_data,'patient',existing,patientId);}
   else{
    let result;try{result=await H.database().rpc('save_food_journal',attempt);}catch(e){lock();throw e;}
    if(result.error){if(['P0001','42501','22023','23503','23514','23505'].includes(result.error.code)){attempt=null;sessionStorage.removeItem(opKey);}else lock();throw Error(result.error.message);}
    try{await load();}catch(e){lock();throw e;}render();
   }
   sessionStorage.removeItem(opKey);sessionStorage.removeItem(draftKey);
   const gained=Math.max(0,H.stats(pat()).xp-before);toast('Refeição registrada para sua nutri.'+(gained?` +${gained} XP de cuidado.`:''));
  }
 }
 return {open,forMeal};
}
