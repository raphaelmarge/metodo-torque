import {safePhoto,visibleRecords,recordDay,composition,numberValue,fieldValue} from './assessment.js';
import {runtimeMedalhaVisual} from './vendor/medalha-visual.js';
import {careSummary,mealPresence,nextMeal,CARE_POLICY_START} from './care-progress.js';

const paths={
  home:'<path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/>',
  food:'<circle cx="12" cy="12" r="6"/><path d="M3 3v6m-2-6v3q0 3 4 3V3M3 9v12M21 3v18m0-18q-4 3 0 9"/>',
  chart:'<path d="M4 3v17h17M7 14l4-4 4 2 5-7"/>',
  chat:'<path d="M21 11a8 8 0 0 1-8 8H7l-4 3V6a3 3 0 0 1 3-3h7a8 8 0 0 1 8 8Z"/><path d="M7 8h9M7 12h6"/>',
  menu:'<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="15" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="15" width="6" height="6" rx="1.5"/><rect x="15" y="15" width="6" height="6" rx="1.5"/>',
  water:'<path d="M12 2C10 6 5 10 5 15a7 7 0 0 0 14 0c0-5-5-9-7-13Z"/><path d="M8 15q0 4 4 4"/>',
  moon:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
  journal:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
  award:'<circle cx="12" cy="9" r="6"/><path d="m8 14-2 8 6-3 6 3-2-8M10 9l1 1 3-3"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6M17 2v6M3 10h18M7 14h3M14 14h3M7 17h3"/>',
  person:'<circle cx="12" cy="7" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/>',
  camera:'<path d="M3 7h4l2-3h6l2 3h4v14H3z"/><circle cx="12" cy="14" r="4"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  bell:'<path d="M4 17h16l-2-3V9a6 6 0 0 0-12 0v5zM9 21h6"/>',
  settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  heart:'<path d="M12 21 3 12C-3 4 8-1 12 7c4-8 15-3 9 5Z"/>',
  money:'<rect x="2" y="5" width="20" height="14" rx="3"/><circle cx="12" cy="12" r="3"/><path d="M5 12h1m12 0h1"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  leaf:'<path d="M20 3C5 1 1 11 7 17c6 6 16 1 13-14ZM4 21 16 9"/>',
  help:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 1 1 4 3l-1 1v1m0 3h.01"/>'
};
const iconNames={today:'home',overview:'home',food:'food',plans:'food',progress:'chart',assessments:'chart',clinical:'chart',chat:'chat',more:'menu',achievements:'award',challenges:'award',forms:'journal',questionnaires:'journal',journal:'journal',documents:'journal',library:'journal',recipes:'leaf',booking:'calendar',appointments:'calendar',community:'heart',benefits:'award',payments:'money',finance:'money',goals:'target','profile-settings':'person',patients:'person',settings:'settings',brand:'settings',images:'camera',reports:'chart',professional:'person',support:'help',operations:'menu'};
export function icon(key){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(paths[iconNames[key]||key]||paths.menu)+'</svg>';}
export function journeyLevel(xp){let level=1;while(50*level*(level+1)<=xp)level++;const floor=50*(level-1)*level,next=50*level*(level+1);return {level,next,percent:Math.min(100,Math.max(0,(xp-floor)/(next-floor)*100))};}
const dayString=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
export function createPatientExperience(H,P,A){
  const {state,esc,today,dateLabel,heading,render,modal,run,toast}=H;
  const s=state,pat=P.pat,q=x=>document.querySelector(x);
  const medals=runtimeMedalhaVisual();
  let viewedDay=today(),weekOffset=0,identity='';
  const records=kind=>visibleRecords(s().records||[],pat()?.id||s().selected,s().role,[kind]);
  const profilePhoto=()=>safePhoto(records('profile_photo').slice().sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at))).at(-1)?.data.image);
  const avatar=(cls='')=>'<button class="patient-avatar '+cls+'" data-page="profile-settings" aria-label="Abrir meu perfil">'+(profilePhoto()?'<img src="'+esc(profilePhoto())+'" alt="">':icon('person'))+'</button>';
  const caption=()=>s().clinic.name||'Torque Nutri';
  const patientLogs=p=>typeof H.logs==='function'?H.logs(p):((s().logs||[]).filter(x=>x.patient_id===p?.id));
  const log=day=>patientLogs(pat()).find(x=>x.day===day)||{day,meals:[],water_ml:0};
  const format=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:1});
  const care=p=>careSummary({patientId:p?.id,logs:patientLogs(p),records:s().records||[],today:today(),clinicGoal:s().clinic.weekly_goal});
  const presence=(day,planVersion)=>mealPresence({patientId:pat()?.id,day,logs:patientLogs(pat()),records:s().records||[],planVersion});
  const linkedRecipe=(meal,plan)=>{const ids=[meal?.receitaId,...(meal?.itens||[]).map(x=>x.receitaId)].filter(Boolean);return (plan?.receitas||[]).find(x=>ids.includes(x.id));};
  function ensureContext(){const key=(s().user?.id||'demo')+':'+s().selected;if(identity!==key){identity=key;viewedDay=today();weekOffset=0;}}
  function medalData(){
    const metric=H.metrics();
    return H.badgeDefs().map(d=>({d,p:MT_MEDALHAS.progresso(d,metric)}));
  }
  function medalImage(item){
    const map={gota:'water',maca:'leaf',prato:'food',calendario:'calendar',lua:'moon',check:'check'},p=paths[map[item.d.icone]||'award'];
    return medals.url({n:item.d.n,p,bloqueada:item.p.nivel===0,cores:medals.paleta({cor:s().clinic.color,clara:'#d4f2e4',escura:'#1e5945'},item.p.nivel,item.p.nivel===0)});
  }
  function nextMedal(){
    const list=medalData();return list.filter(x=>x.p.proxima!=null).sort((a,b)=>b.p.percentual-a.p.percentual)[0]||list[0];
  }
  function week(){
    const d=new Date(today()+'T12:00:00');d.setDate(d.getDate()-((d.getDay()+6)%7)+weekOffset*7);
    return Array.from({length:7},(_,i)=>{const x=new Date(d);x.setDate(x.getDate()+i);return {day:dayString(x),label:['S','T','Q','Q','S','S','D'][i],full:['Segunda','Terça','Quarta','Quinta','Sexta','Sábado','Domingo'][i]};});
  }
  function contextualCare({p,plan,meals,registered,next,st}){
    const gap=st.lastCareDay?Math.floor((Date.parse(today()+'T12:00:00Z')-Date.parse(st.lastCareDay+'T12:00:00Z'))/86400000):null;
    const first=gap==null,returning=gap>=3,meal=next.meal;
    const eyebrow=first?'Seu primeiro passo':returning?'Retome no seu ritmo':'Um cuidado possível agora';
    const title=first?'Vamos começar pelo que cabe hoje?':returning?'Bom ter você por aqui.':meal?(next.state==='upcoming'?'Prepare sua próxima refeição':'Sua próxima refeição'):'Cada cuidado conta.';
    const message=first?'Você pode registrar uma refeição, consultar seu plano ou contar como está. Escolha um começo simples.':returning?'Há alguns dias sem registros por aqui. Você pode retomar com uma ação pequena e contar com sua nutri.':meal?(next.state==='upcoming'?'O horário está mais adiante. Consulte as opções e registre depois de comer.':'Veja as opções do seu plano e registre o que você realmente consumiu.'):(plan?'Se quiser registrar algo fora do plano ou contar como está, seu espaço continua aqui.':'Seu plano aparecerá quando sua nutri publicar. Enquanto isso, compartilhe como está sua rotina.');
    let html=`<section class="card contextual-care next-meal-card ${first?'first-care':returning?'return-care':''}" aria-labelledby="contextual-care-title"><div class="card-head"><div><span class="eyebrow">${eyebrow}</span><h2 id="contextual-care-title">${title}</h2></div>${icon(returning?'heart':'food')}</div><p class="sub">${message}</p>`;
    if(meal){
      html+=`<div class="next-meal-title"><div class="meal-time">${esc(meal.hora||'No seu horário')}</div><h3>${esc(meal.titulo)}</h3></div><div class="next-meal-foods">${(meal.itens||[]).map(f=>`<div><span>${esc(f.nome)}</span><b>${esc(f.qtd+' × '+f.porcao)}</b></div>`).join('')}</div><div class="actions"><button class="btn primary" data-log-meal="${esc(meal.id)}">${icon('journal')}Registrar refeição</button><button class="btn ghost" data-page="food">Ver substituições ${icon('arrow')}</button>${linkedRecipe(meal,plan)?`<button class="btn" data-x="plan-recipe" data-id="${esc(meal.id)}">${icon('leaf')}Ver preparo</button>`:''}</div>`;
    }else{
      html+=`<div class="actions">${plan?'<button class="btn primary" data-x="journal-entry">'+icon('journal')+'Registrar o que comi</button><button class="btn ghost" data-page="food">Ver meu plano '+icon('arrow')+'</button>':'<button class="btn primary" data-action="checkin">'+icon('moon')+'Contar como estou</button><button class="btn ghost" data-page="chat">Conversar com minha nutri '+icon('arrow')+'</button>'}</div>`;
      if(meals.length&&meals.every(m=>registered.mealIds.includes(m.id)))html+='<p class="care-completion">As refeições previstas para hoje têm registro. Você pode consultar ou corrigir seu relato no diário.</p>';
      else if(next.state==='not-started')html+='<p class="care-completion">Confira a data de início e as orientações com sua nutri.</p>';
    }
    if(meals.length)html+=`<details class="day-meals"><summary>Todas as refeições de hoje · ${meals.filter(m=>registered.mealIds.includes(m.id)).length}/${meals.length} com registro</summary>${H.mealsView({...plan,refeicoes:meals},true)}</details>`;
    return html+'</section>';
  }
  function feedbackCard(p){
    const journalIds=new Set(records('food_journal').map(x=>x.id));
    const feedback=records('nutrition_feedback').filter(x=>x.visibility==='patient'&&x.clinician_id===p.clinician_id&&x.created_by===p.clinician_id&&journalIds.has(x.data?.entryId)&&x.data?.text).at(-1);
    if(!feedback)return '';
    const entry=records('food_journal').find(x=>x.id===feedback.data.entryId);
    return `<section class="card home-feedback"><span class="eyebrow">Orientação da sua nutri</span><h2>${esc(s().clinic.professional_name)}</h2><p class="document-text">${esc(feedback.data.text)}</p><p class="sub">${esc(dateLabel(recordDay(feedback)))} · sobre ${esc(entry.title)}${entry.version!==feedback.data.entryVersion?' · seu relato foi atualizado depois desta orientação':''}</p><button class="btn ghost" data-page="journal">Abrir meu diário ${icon('arrow')}</button></section>`;
  }
  function home(){
    ensureContext();const p=pat();if(!p)return heading('Meu acompanhamento','Vamos começar','Seu vínculo com o consultório ainda não está disponível.');
    const published=H.published(),plan=published?.data,daylog=log(viewedDay),current=viewedDay===today();
    const registered=presence(viewedDay,published?.version),st=care(p),level=journeyLevel(st.xp);
    const next=nextMeal({plan,day:viewedDay,now:new Date(),recordedMealIds:registered.mealIds});
    const meals=plan&&!['future-start','no-meals-today','inactive-plan'].includes(next.reason)?(typeof MT_NUTRICAO.refeicoesDia==='function'?MT_NUTRICAO.refeicoesDia(plan,viewedDay):(plan.refeicoes||[])):[];
    const waterTarget=numberValue(plan?.aguaMl),water=Number(daylog.water_ml||0),waterPct=waterTarget>0?Math.min(100,water/waterTarget*100):0;
    const cover=P.resources('notice').find(x=>x.shared&&x.data.presentation==='patient_cover')?.data;
    const coverImage=safePhoto(cover?.image)||'assets/nutrition-cover.png',nd=nextMedal();
    const appointments=(s().appointments||[]).filter(x=>x.patient_id===p.id&&(x.status||'scheduled')==='scheduled'&&new Date(x.start_at)>=new Date()).sort((a,b)=>a.start_at.localeCompare(b.start_at));
    const latest=A.all().at(-1),hasCheck=!!daylog.mood||daylog.sleep!=null||!!daylog.note;
    const planTitle=cover?.title||plan?.titulo||'Seu cuidado começa aqui';
    let html=`<div class="patient-experience"><section class="patient-cover" aria-label="Seu acompanhamento"><img class="patient-cover-image" src="${esc(coverImage)}" alt=""><div class="cover-veil"></div><div class="cover-top"><div class="cover-brand">${s().clinic.logo?'<img src="'+esc(s().clinic.logo)+'" alt="">':icon('leaf')}<div><b>${esc(caption())}</b><span>${esc(s().clinic.professional_name)}</span></div></div>${avatar()}</div><div class="cover-copy"><span class="cover-greeting">Olá, ${esc(p.name.split(' ')[0])}.</span><h1>${esc(planTitle)}</h1><p>${esc(cover?.subtitle||p.goal||'Uma rotina de cuidado, no seu ritmo.')}</p><button class="btn primary" data-page="${plan?'food':'chat'}">${plan?'Ver meu plano alimentar':'Conversar com minha nutri'}${icon('arrow')}</button></div><div class="cover-credit">TORQUE NUTRI <span>· seu acompanhamento</span></div></section>`;
    if(current){
      html+=contextualCare({p,plan,meals,registered,next,st});
      html+=`<section class="card care-week-summary" aria-labelledby="care-week-title"><div><span class="eyebrow">A constância que cabe na sua semana</span><h2 id="care-week-title">${st.days} de ${st.target} dias com cuidado registrado</h2><p class="sub">${st.goalOrigin==='personal'?'Sua meta pessoal':'Meta definida pelo consultório'}. Refeições, água e check-ins ajudam a acompanhar sua rotina.</p></div><button class="btn ghost" data-page="goals">Ajustar minha meta ${icon('arrow')}</button><div class="progress" role="progressbar" aria-label="Dias de cuidado nesta semana" aria-valuemin="0" aria-valuemax="${st.target}" aria-valuenow="${Math.min(st.target,st.days)}"><i style="width:${Math.min(100,st.days/st.target*100)}%"></i></div></section>`;
    }
    html+=`<section class="journey-strip" aria-label="Progresso da jornada"><button class="level-ring" data-page="achievements" style="--level:${level.percent}" aria-label="Nível ${level.level}. Ver conquistas"><span>${level.level}</span></button><div class="grow"><b>Nível ${level.level} · ${level.level>2?'No ritmo':level.level>1?'Ganhando constância':'Primeiros passos'}</b><div class="level-track"><i style="width:${level.percent}%"></i></div><small>${st.xp} XP <span>· ${level.next-st.xp} para o próximo nível</span></small></div><button class="journey-award" data-page="achievements" aria-label="Ver minhas medalhas">${icon('award')}</button></section>`;
    html+=`<div class="today-heading"><div><span class="eyebrow">Um dia de cada vez</span><h2>${current?'Hoje, no seu ritmo':esc(dateLabel(viewedDay))}</h2></div><div class="week-controls"><button data-week-shift="-1" aria-label="Semana anterior">‹</button><button data-home-today>Hoje</button><button data-week-shift="1" aria-label="Próxima semana">›</button></div></div><div class="patient-week" aria-label="Dias com cuidado registrado">${week().map(x=>{const hasCare=st.careDays.includes(x.day);return `<button data-view-day="${x.day}" class="${viewedDay===x.day?'selected ':''}${x.day===today()?'is-today ':''}${hasCare?'is-complete':''}" aria-pressed="${viewedDay===x.day}" aria-label="${esc(x.full+', '+dateLabel(x.day)+(hasCare?', cuidado registrado':''))}"><span>${x.label}</span><b>${Number(x.day.slice(8))}</b><i>${hasCare?'✓':''}</i></button>`;}).join('')}</div><p class="calendar-caption">O check indica um cuidado registrado. Seguir o plano é uma confirmação separada.</p>`;
    if(!current)html+=`<div class="history-notice">Registros de ${esc(dateLabel(viewedDay))}. <button class="btn small ghost" data-home-today>Voltar aos registros de hoje</button></div>`;
    html+=`<div class="habit-grid"><button class="habit-card ${daylog.followed?'completed':''}" ${current?'data-action="followed"':'data-home-detail="plan"'}>${icon('food')}<b>Segui meu plano</b><strong>${daylog.followed?'Confirmado por você':'Você ainda não confirmou'}</strong><small>${current?(daylog.followed?'Toque para corrigir esta confirmação':'Confirme somente se seguiu seu plano'):'Sua confirmação neste dia'}</small></button><button class="habit-card water-habit" ${current?'data-action="water"':'data-home-detail="water"'}>${icon('water')}<b>Hidratação</b><strong>${format(water/1000)} <span>L${waterTarget>0?' / '+format(waterTarget/1000)+' L':''}</span></strong><small>${current?'+ 250 ml de água':'Água registrada neste dia'}</small></button><button class="habit-card" ${current?'data-action="checkin"':'data-home-detail="checkin"'}>${icon('moon')}<b>Sono e bem-estar</b><strong>${daylog.sleep!=null?format(daylog.sleep)+' h':hasCheck?'Registrado':'Como você está?'}</strong><small>${current?'Abrir meu check-in':'Ver check-in deste dia'}</small></button><button class="habit-card" ${current?'data-page="journal"':'data-home-detail="journal"'}>${icon('journal')}<b>Diário alimentar</b><strong>${registered.count} <span>registros</span></strong><small>${current?'Seu relato, com fotos e ajustes':'Consultar os registros deste dia'}</small></button></div>`;
    if(!current)return html+historyDay(daylog)+'</div>';
    const recipeMeals=meals.filter(m=>linkedRecipe(m,plan));
    html+='<div class="patient-content-grid"><div>'+feedbackCard(p);
    if(recipeMeals.length)html+=`<section class="card plan-recipes"><span class="eyebrow">Preparo do seu plano</span><h2>Receitas para esta rotina</h2><p class="sub">Orientações de preparo ligadas às refeições prescritas pela sua nutri.</p><div class="plan-recipe-list">${recipeMeals.map(m=>{const r=linkedRecipe(m,plan);return `<button data-x="plan-recipe" data-id="${esc(m.id)}">${icon('leaf')}<span><b>${esc(r.nome||r.n||r.title||'Ver receita')}</b><small>${esc(m.titulo)}${r.tempo?' · '+esc(r.tempo)+' min':''}</small></span>${icon('arrow')}</button>`;}).join('')}</div></section>`;
    html+=`<section class="card home-evolution"><div class="card-head"><div><span class="eyebrow">Meu acompanhamento</span><h2>Você, em evolução</h2></div>${icon('chart')}</div>${latest?'<p class="sub">Última avaliação · '+esc(dateLabel(recordDay(latest)))+'</p><div class="evolution-preview">'+[['Peso','weight','kg'],['Gordura','fat','%'],['Cintura','waist','cm']].map(([n,k,u])=>{const value=k==='waist'?fieldValue(latest.data,'waist'):composition(latest.data)[k];return '<div><span>'+n+'</span><b>'+(value==null?'—':format(value))+' <small>'+u+'</small></b></div>';}).join('')+'</div>':'<p class="sub">Medidas, composição corporal e fotos ganham um lugar próprio na sua jornada.</p>'}<div class="actions"><button class="btn" data-page="progress">Acompanhar evolução ${icon('arrow')}</button><button class="btn ghost" data-x="body-photos">${icon('camera')}Minhas fotos</button></div></section></div><div><section class="card water-panel"><div class="card-head"><h2>Água, no seu ritmo</h2>${icon('water')}</div><div class="water-total">${format(water/1000)}<span>L</span></div><p class="sub">${waterTarget>0?'Meta do seu plano: '+format(waterTarget/1000)+' L':'Seu plano ainda não informa uma meta de água.'}</p><div class="water-drops" aria-hidden="true">${Array.from({length:8},(_,i)=>'<span class="'+(waterPct>=((i+1)/8*100)?'filled':'')+'">'+icon('water')+'</span>').join('')}</div><div class="actions"><button class="btn primary" data-action="water">+ 250 ml</button><button class="btn ghost" data-action="water-undo" aria-label="Remover 250 mililitros de água">− 250 ml</button></div></section>`;
    if(nd)html+=`<section class="card next-achievement"><span class="eyebrow">Próxima conquista</span><div class="medal-preview"><img src="${medalImage(nd)}" alt=""><div><h2>${esc(nd.d.n)}</h2><p>${nd.p.valor} / ${nd.p.proxima??nd.p.atual} ${esc(nd.d.unidade)}</p></div></div><div class="progress"><i style="width:${nd.p.percentual}%"></i></div><button class="btn ghost" data-page="achievements">Ver minhas conquistas ${icon('arrow')}</button></section>`;
    html+=`<section class="card care-card"><span class="eyebrow">Seu espaço com a nutri</span><h2>${esc(s().clinic.professional_name)}</h2><p class="sub">${appointments.length?'Próxima consulta: '+esc(new Date(appointments[0].start_at).toLocaleString('pt-BR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})):'Compartilhe suas dúvidas e os ajustes de que precisa na rotina.'}</p><button class="btn" data-page="chat">${icon('chat')}Conversar</button></section></div></div></div>`;
    return html;
  }
  function historyDay(dl){
    const journal=records('food_journal').filter(x=>(x.data?.day||recordDay(x))===viewedDay);
    const registered=presence(viewedDay);
    return `<section class="card day-history"><h2>O que ficou registrado</h2><div class="summary-line"><span>Registros de refeições</span><b>${registered.count}</b></div><div class="summary-line"><span>Plano seguido, conforme sua confirmação</span><b>${dl.followed?'Sim':'Não confirmado'}</b></div><div class="summary-line"><span>Água</span><b>${format(dl.water_ml)} ml</b></div><div class="summary-line"><span>Peso informado no check-in</span><b>${dl.weight==null?'Não informado':format(dl.weight)+' kg'}</b></div><div class="summary-line"><span>Como me senti</span><b>${esc(H.moodName(dl.mood)||'Não informado')}</b></div><p class="document-text">${esc(dl.note||'Nenhuma anotação neste dia.')}</p>${journal.map(x=>`<article class="history-meal"><h3>${esc(x.title)}</h3>${safePhoto(x.data.image)?'<img class="record-image" src="'+esc(safePhoto(x.data.image))+'" alt="Foto registrada da refeição">':''}${(x.data.items||[]).map(it=>'<div class="summary-line"><span>'+esc(it.nome)+'</span><span>'+esc(it.qtd+' × '+it.porcao)+'</span></div>').join('')}<p class="document-text">${esc(x.data.note||'')}</p><small>Versão ${esc(x.version)} do relato${x.data.planVersion?' · plano de referência '+esc(x.data.planVersion):' · sem plano de referência'}</small></article>`).join('')}<p class="sub">Esta é a consulta dos registros deste dia. Seu plano atual está na aba Alimentação.</p></section>`;
  }
  function achievements(){
    const list=medalData(),st=care(pat()),level=journeyLevel(st.xp);
    return heading('Minha jornada','Cada cuidado conta','Sua constância ganha forma, um registro de cada vez.')+
      '<section class="journey-level-card"><div class="level-ring" style="--level:'+level.percent+'"><span>'+level.level+'</span></div><div><span class="eyebrow">Nível '+level.level+'</span><h2>'+st.xp+' XP na sua jornada</h2><p>'+list.filter(x=>x.p.nivel>0).length+' medalhas iniciadas · '+(level.next-st.xp)+' XP para o próximo nível</p></div></section>'+
      '<div class="patient-medal-grid">'+list.map(x=>'<button class="medal-card '+(!x.p.nivel?'locked':'')+'" data-medal-id="'+esc(x.d.id)+'"><img src="'+medalImage(x)+'" alt=""><span class="pill">'+(x.p.nivel?'Nível '+x.p.nivel:'Primeiro marco')+'</span><h2>'+esc(x.d.n)+'</h2><p>'+esc(x.d.criterio)+'</p><div class="progress"><i style="width:'+x.p.percentual+'%"></i></div><small>'+x.p.valor+' / '+(x.p.proxima??x.p.atual)+' '+esc(x.d.unidade)+'</small></button>').join('')+'</div>'+
      '<section class="card patient-challenges"><h2>Desafios do consultório</h2>'+s().challenges.map(c=>{const value=H.metrics()[c.metric]||0;return '<div class="challenge-row">'+icon('target')+'<div class="grow"><b>'+esc(c.title)+'</b><div class="progress"><i style="width:'+Math.min(100,value/c.target*100)+'%"></i></div></div><span>'+value+' / '+c.target+'</span></div>';}).join('')+(s().challenges.length?'':'<p class="sub">Sua nutri ainda não publicou desafios.</p>')+'</section><p class="sub care-xp-policy">Desde '+esc(dateLabel(CARE_POLICY_START))+', os registros de cuidado somam até 20 XP por dia. Pesagem não soma pontos novos e confirmar plano seguido não gera bônus. Os créditos anteriores foram preservados; corrigir um registro não soma pontos novamente.</p>';
  }
  function menu(){
    const groups=[['Minha rotina',['journal','recipes','goals','achievements']],['Meu acompanhamento',['clinical','forms','documents','booking','community']],['Conta e benefícios',['profile-settings','payments','benefits','settings','support']]];
    return heading('Tudo no seu lugar','Meu acompanhamento','As áreas da sua jornada, conectadas.')+
      '<section class="patient-profile-banner">'+avatar()+'<div class="grow"><h2>'+esc(pat()?.name||'Meu perfil')+'</h2><p>'+esc(pat()?.goal||'Seu objetivo será definido com a nutri.')+'</p></div><button class="btn small ghost" data-page="profile-settings">Editar perfil</button></section>'+
      groups.map(([name,ids])=>'<section class="patient-menu-section"><h2>'+name+'</h2><div class="patient-menu-grid">'+ids.map(id=>'<button data-page="'+id+'">'+icon(id)+'<span>'+esc(P.patientPages.find(x=>x[0]===id)?.[1]||id)+'</span>'+icon('arrow')+'</button>').join('')+'</div></section>').join('');
  }
  function profile(){
    return heading('Seu espaço','Meu perfil','Sua identidade e seus registros no acompanhamento.')+
      '<section class="card patient-profile-banner">'+avatar()+'<div class="grow"><h2>'+esc(pat()?.name||'')+'</h2><p>'+esc(pat()?.email||'')+'</p></div><button class="btn" data-x="profile-photo">Alterar minha foto</button></section>'+
      '<div class="body-columns"><section class="card"><span class="eyebrow">Meu objetivo</span><h2>'+esc(pat()?.goal||'Construir minha rotina')+'</h2><p class="sub">Ajuste suas metas de constância para acompanhar o que importa para você.</p><button class="btn" data-page="goals">Abrir metas pessoais</button></section><section class="card"><span class="eyebrow">Registro corporal</span><h2>Minhas fotos de evolução</h2><p class="sub">'+A.photos().length+' fotos no acompanhamento. Organize as datas e os ângulos e compare seus registros.</p><button class="btn" data-x="body-photos">'+icon('camera')+'Abrir fotos de evolução</button></section></div>';
  }
  function coverSettings(){
    const cover=P.resources('notice').find(x=>x.data.presentation==='patient_cover'),d=cover?.data||{};
    return '<section class="card cover-settings"><div class="card-head"><div><span class="eyebrow">Identidade no app do aluno</span><h2>Capa do acompanhamento</h2></div>'+icon('camera')+'</div><div class="body-columns"><form id="patient-cover-form"><label>Título da capa<input id="patient-cover-title" maxlength="100" value="'+esc(d.title||'')+'" placeholder="Usar o título do plano alimentar"></label><label>Mensagem de apoio<input id="patient-cover-subtitle" maxlength="180" value="'+esc(d.subtitle||'')+'" placeholder="Usar o objetivo do paciente"></label><label>Imagem de capa<input id="patient-cover-file" type="file" accept="image/png,image/jpeg,image/webp"></label><label class="check-label"><input id="patient-cover-reset" type="checkbox"> Usar a imagem padrão de nutrição</label><button class="btn primary" type="submit">Salvar capa do app</button><p class="sub">A capa é compartilhada com os pacientes da clínica. As fotos de evolução são mantidas na área privada de avaliação.</p></form><div class="cover-settings-preview"><img src="'+esc(safePhoto(d.image)||'assets/nutrition-cover.png')+'" alt="Capa atual do acompanhamento"><strong>'+esc(d.title||'Minha rotina alimentar')+'</strong></div></div></section>';
  }
  function bind(){
    document.querySelectorAll('[data-view-day]').forEach(b=>b.onclick=()=>{viewedDay=b.dataset.viewDay;render();});
    document.querySelectorAll('[data-week-shift]').forEach(b=>b.onclick=()=>{weekOffset+=Number(b.dataset.weekShift);viewedDay=week()[0].day;render();});
    document.querySelectorAll('[data-home-today]').forEach(b=>b.onclick=()=>{viewedDay=today();weekOffset=0;render();});
    document.querySelectorAll('[data-home-detail]').forEach(b=>b.onclick=()=>modal('Registro de '+esc(dateLabel(viewedDay)),historyDay(log(viewedDay))));
    document.querySelectorAll('[data-medal-id]').forEach(b=>b.onclick=()=>{const x=medalData().find(x=>x.d.id===b.dataset.medalId);if(!x)return;modal(esc(x.d.n),'<div class="medal-detail"><img src="'+medalImage(x)+'" alt=""><p>'+esc(x.d.criterio)+'</p><p><b>'+x.p.valor+'</b> '+esc(x.d.unidade)+' registrados</p><ol>'+x.d.metas.map((n,i)=>'<li class="'+(x.p.valor>=n?'achieved':'')+'">Nível '+(i+1)+' · '+n+' '+esc(x.d.unidade)+(x.p.valor>=n?' · conquistado':'')+'</li>').join('')+'</ol></div>');});
    if(q('#patient-cover-form'))q('#patient-cover-form').onsubmit=e=>{e.preventDefault();run(async()=>{
      const existing=P.resources('notice').find(x=>x.data.presentation==='patient_cover'),d=existing?.data||{},file=q('#patient-cover-file').files[0];
      const image=q('#patient-cover-reset').checked?'':file?await P.imageFile(file):safePhoto(d.image);
      await P.saveResource('notice','Capa do aplicativo',{...d,presentation:'patient_cover',title:q('#patient-cover-title').value.trim(),subtitle:q('#patient-cover-subtitle').value.trim(),image},true,existing);
    });};
  }
  return {home,achievements,menu,profile,coverSettings,bind,avatar,icon};
}
