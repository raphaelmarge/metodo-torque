/* Complemento estruturado da anamnese. Relatos nunca são aprovações clínicas. */
(function (root) {
  'use strict';
  function collect(doc, now) {
    function value(id) { var el=doc.getElementById(id);return el?String(el.value||'').trim().slice(0,1000):''; }
    function selected(name) { return Array.from(doc.querySelectorAll('[name="'+name+'"]:checked')).map(function(el){return el.value;}); }
    function number(id) { var s=value(id),n=Number(s);return s&&isFinite(n)?n:null; }
    var birth=value('gmBirth'),today=(now||new Date()).toISOString().slice(0,10),age=null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(birth)&&birth<=today) { var b=new Date(birth+'T12:00:00Z');if(isFinite(b.getTime())&&b.toISOString().slice(0,10)===birth){age=Number(today.slice(0,4))-Number(birth.slice(0,4));if(today.slice(5)<birth.slice(5))age--;if(age<0||age>120)age=null;} }
    var conditions=selected('gmCondition').map(function(id){var names={injury:'Lesão ou cirurgia',diabetes:'Diabetes',limb:'Ausência de membro ou deficiência',cardiovascular:'Condição cardiovascular',respiratory:'Condição respiratória',neurological:'Condição neurológica',other:'Outra condição'};return {id:id,name:names[id],details:id==='other'?value('gmOther'):''};});
    var healthResponse=value('gmHealth')||'unknown',health=healthResponse==='not_sure'?'unknown':healthResponse;if(health!=='reported')conditions=[];
    var fields={birthDate:birth,age:age,genderIdentity:value('gmGender'),healthStatus:health,healthResponseStatus:healthResponse,conditions:conditions,
      functional:{available:selected('gmAvailable'),unavailable:selected('gmUnavailable'),details:value('gmFunction'),resources:value('gmResources')},
      healthDetails:{injury:{region:value('gmInjuryRegion'),side:value('gmInjurySide'),phase:value('gmInjuryPhase'),limitations:value('gmInjuryLimits')},limb:{segment:value('gmLimbSegment'),side:value('gmLimbSide')},diabetes:{type:value('gmDiabetesType'),treatment:value('gmDiabetesTreatment'),hypoglycemia:value('gmHypo'),complications:value('gmComplications')},guidance:value('gmGuidance'),professional:value('gmProfessional'),guidanceDate:value('gmGuidanceDate')},
      level:value('fNivel'),modality:value('gmModality'),regularity:value('gmRegularity'),familiarity:value('gmFamiliarity'),
      returning:value('gmReturning')==='sim',returnStatus:value('gmReturning')||'unknown',returnDetails:{duration:value('gmPause'),reason:value('gmPauseReason')},
      objective:value('gmGoal'),secondaryObjective:value('gmSecondGoal'),priorities:selected('gmPriority'),days:selected('gmDay').map(Number),minutes:number('gmMinutes'),equipment:selected('gmEquipment'),equipmentMode:value('gmEnvironment')==='gym'&&!selected('gmEquipment').length?'standard_gym':(['home','outdoors','mixed'].includes(value('gmEnvironment'))||selected('gmEquipment').length?'custom':undefined),environment:value('gmEnvironment'),otherActivities:value('gmOtherActivities'),
      preferences:{prefer:value('fGosta')?[value('fGosta')]:[],avoid:value('fNaoGosta')?[value('fNaoGosta')]:[]},recovery:{sleep:value('fSono'),fatigue:value('gmFatigue'),details:value('gmRecovery')},physiology:{status:value('gmPhysiologyStatus')||'unknown',details:value('gmPhysiology')},
      source:'aluno',status:'relatada',reportedAt:(now||new Date()).toISOString(),version:1};
    return fields;
  }
  function errors(p) {
    var out=[];if(!p.level)out.push('Informe seu nível atual.');if(!p.objective)out.push('Escolha seu objetivo principal.');
    if(p.birthDate&&p.age===null)out.push('Confira a data de nascimento.');
    if(p.objective&&p.objective===p.secondaryObjective)out.push('O objetivo secundário deve ser diferente do principal.');
    if(!p.days.length)out.push('Marque os dias em que pode treinar.');if(!Number.isInteger(p.minutes)||p.minutes<10||p.minutes>240)out.push('Informe entre 10 e 240 minutos por sessão.');
    if(p.healthStatus==='reported'&&!p.conditions.length)out.push('Selecione ao menos uma condição ou marque outra condição.');
    if(p.functional.available.some(function(x){return p.functional.unavailable.indexOf(x)>=0;}))out.push('Uma capacidade não pode estar marcada como disponível e limitada ao mesmo tempo.');
    return out;
  }
  function mount(doc) {
    var core=root.MT_GERADOR_MENSAL,cat=root.MT_GERADOR_MENSAL_CATALOGO;
    if(!core||!cat)throw Error('O catálogo do gerador não carregou. Recarregue a página antes de enviar.');
    function options(id,map,empty){var el=doc.getElementById(id);el.innerHTML='';var first=doc.createElement('option');first.value='';first.textContent=empty;el.appendChild(first);Object.keys(map).forEach(function(k){var op=doc.createElement('option');op.value=k;op.textContent=map[k];el.appendChild(op);});}
    options('fNivel',core.LEVELS,'Não informado');options('gmGoal',core.OBJECTIVES,'Selecione');options('gmSecondGoal',core.OBJECTIVES,'Sem objetivo secundário');
    function checks(name,ids,labels){var old=doc.querySelector('[name="'+name+'"]'),container=old&&old.closest('.gm-grid');if(!container)return;container.innerHTML='';ids.forEach(function(id){var label=doc.createElement('label');label.className='chk';var input=doc.createElement('input');input.type='checkbox';input.name=name;input.value=id;label.appendChild(input);label.appendChild(doc.createTextNode(labels[id]||id));container.appendChild(label);});}
    var functional={legs_bilateral:'Uso de ambas as pernas',arms_bilateral:'Uso de ambos os braços',arm_single:'Uso de um braço',grip_bilateral:'Preensão com ambas as mãos',grip_single:'Preensão com uma mão',standing:'Permanecer em pé',transfer:'Sentar e mudar de posição',floor_transfer:'Deitar e levantar do solo',hip_hinge:'Flexionar o quadril',support_arm:'Apoiar peso no braço'};
    var equipment={cadeira:'Cadeira',halteres:'Halteres',banco:'Banco',colchonete:'Colchonete',parede:'Parede',elastico:'Elástico',ancoragem:'Ancoragem para elástico',apoio:'Apoio estável',polia:'Polia',leg_press:'Leg press',extensora:'Cadeira extensora',flexora:'Cadeira flexora',supino_maquina:'Máquina de supino',remada_maquina:'Máquina de remada'};
    checks('gmAvailable',cat.functionalTags,functional);checks('gmUnavailable',cat.functionalTags,functional);checks('gmEquipment',cat.equipment,cat.equipmentLabels||equipment);
    checks('gmPriority',['Quadríceps','Glúteos','Posteriores','Peito','Costas','Ombros','Bíceps','Tríceps','Core','Panturrilhas'],{});
    function toggle(){var health=doc.getElementById('gmHealth');doc.querySelectorAll('[data-gm-when]').forEach(function(el){var trigger=doc.getElementById(el.dataset.gmWhen);el.hidden=!(trigger&&(trigger.type==='checkbox'?health.value==='reported'&&trigger.checked:trigger.value==='sim'||trigger.value==='reported'));});}
    doc.addEventListener('change',function(ev){if(ev.target.id&&ev.target.id.indexOf('gm')===0)toggle();if(ev.target.name==='gmDay'){var count=doc.querySelectorAll('[name="gmDay"]:checked').length;doc.getElementById('fDias').value=count?String(count):'';}});toggle();return toggle;
  }
  root.MT_ANAMNESE_GERADOR_MENSAL={collect:collect,errors:errors,mount:mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.MT_ANAMNESE_GERADOR_MENSAL;
})(typeof window!=='undefined'?window:globalThis);
