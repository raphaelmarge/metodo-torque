import {planDaySummary,validPlanDate} from './day-summary.js';
import {planSignature} from './shopping-planner.js';

const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const identifier=value=>typeof value==='string'&&value.trim().length>0;
const validVersion=value=>Number.isInteger(value)&&value>=1&&value<=1000000;
const prefix='torque-nutri-patient-food-choices:v1:';

// These are local daily preferences, never an edit of the published plan or a
// record of food consumed. Only existing prescribed alternatives are selectable.
export function createPatientFoodChoices(H,{pat,storage}={}){
  const local=storage||{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
  let context='',days=new Map(),feedback='';
  function clear(){context='';days=new Map();}
  function publication(row,patient){
    return object(row)&&identifier(row.id)&&row.patient_id===patient.id&&row.status==='published'
      &&validVersion(row.version)&&object(row.data)&&Array.isArray(row.data.refeicoes);
  }
  function prepare(published,day){
    if(!validPlanDate(day))throw Error('Confira a data das escolhas.');
    const state=H.state(),patient=pat?.();
    if(state.role!=='patient'||!identifier(patient?.id)||!identifier(state.clinic?.id)
      ||(!state.demo&&!identifier(state.user?.id))
      ||(patient.clinic_id!=null&&patient.clinic_id!==state.clinic.id)
      ||(!state.demo&&patient.user_id!=null&&patient.user_id!==state.user.id))throw Error('Estas escolhas pertencem ao acesso do paciente.');
    const latest=H.published?.();
    if(!publication(published,patient)||!publication(latest,patient))throw Error('Abra o plano publicado atual deste paciente.');
    const signature=planSignature(published.data,!!state.demo);
    if(published.id!==latest.id||published.version!==latest.version||signature!==planSignature(latest.data,!!state.demo))throw Error('O plano mudou. Abra a versão atual antes de escolher.');
    const scope=[state.demo?'demo':'account',state.demo?'demo':state.user.id,state.clinic.id,patient.id,state.demo?'demo-plan':published.id,published.version,signature];
    const next=JSON.stringify(scope);
    if(context!==next){context=next;days=new Map();feedback='';}
    return {plan:published.data,scope,signature,storageKey:prefix+JSON.stringify([...scope,day]),active:new Set(planDaySummary(published.data,day).mealIndices)};
  }
  function prescribedOption(info,key,option){
    if(typeof key!=='string'||!/^(0|[1-9]\d{0,2}):(0|[1-9]\d{0,2})$/.test(key)||!Number.isInteger(option)||option< -1)throw Error('Escolha uma das opções prescritas.');
    const [mi,ii]=key.split(':').map(Number),meal=info.plan.refeicoes[mi],item=meal?.itens?.[ii];
    if(!info.active.has(mi)||!object(item))throw Error('Este alimento não está previsto para a data escolhida.');
    const chosen=option===-1?item:(Array.isArray(item.substituicoes)?item.substituicoes[option]:null);
    if(!object(chosen)||!identifier(chosen.nome))throw Error('Esta alternativa não está prescrita na versão atual.');
    return chosen;
  }
  function restore(info,day){
    if(days.has(day)){const stored=days.get(day);feedback=stored.message;return stored;}
    const stored={choices:{},readable:true,message:''};
    let serialized;
    try{serialized=local.getItem(info.storageKey);}catch{stored.readable=false;stored.message='Não foi possível recuperar as escolhas neste aparelho. Novas escolhas ficam somente nesta sessão.';}
    if(stored.readable&&serialized!=null){
      try{
        const raw=JSON.parse(serialized);
        if(!object(raw)||raw.v!==1||raw.context!==context||raw.day!==day||!object(raw.choices))throw Error('invalid');
        const choices={};
        for(const [key,option] of Object.entries(raw.choices)){prescribedOption(info,key,option);if(option!==-1)choices[key]=option;}
        stored.choices=choices;
      }catch{stored.message='Não foi possível recuperar as escolhas salvas. Selecione novamente as opções deste dia.';}
    }
    days.set(day,stored);feedback=stored.message;return stored;
  }
  function read(published,day){
    try{const info=prepare(published,day);return {...restore(info,day).choices};}
    catch(error){clear();feedback=error.message;return {};}
  }
  function choose(published,day,key,option){
    let info;
    try{info=prepare(published,day);}
    catch(error){clear();feedback=error.message;throw error;}
    try{prescribedOption(info,key,option);}catch(error){feedback=error.message;throw error;}
    const stored=restore(info,day),choices={...stored.choices};
    if(option===-1)delete choices[key];else choices[key]=option;
    let saved=false;
    if(stored.readable)try{
      local.setItem(info.storageKey,JSON.stringify({v:1,context,day,choices}));saved=true;
    }catch{/* A storage failure does not undo the visible session preference. */}
    stored.choices=choices;
    stored.message=saved?'Escolha salva neste aparelho para este dia.':'Escolha atualizada somente nesta sessão. Não foi possível salvar neste aparelho.';
    feedback=stored.message;return {saved};
  }
  function selectedPlan(published,day){
    try{
      const info=prepare(published,day),choices=restore(info,day).choices,plan=structuredClone(info.plan);
      for(const [key,option] of Object.entries(choices)){
        const [mi,ii]=key.split(':').map(Number);
        // Preserve the alternative's own quantity, portion and full snapshot.
        // The principal item's quantity is never applied to an alternative.
        plan.refeicoes[mi].itens[ii]=structuredClone(prescribedOption(info,key,option));
      }
      return plan;
    }catch(error){clear();feedback=error.message;return null;}
  }
  function selectedItem(published,day,mi,ii){
    if(!Number.isInteger(mi)||!Number.isInteger(ii))return null;
    try{
      const info=prepare(published,day),choices=restore(info,day).choices,key=mi+':'+ii;
      return structuredClone(prescribedOption(info,key,choices[key]??-1));
    }catch(error){feedback=error.message;return null;}
  }
  return {read,choose,selectedPlan,selectedItem,message:()=>feedback};
}
