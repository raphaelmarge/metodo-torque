// Assessment records retain their original flat fields and unknown JSON properties.
// No clinical defaults, diagnostic classifications or inferred body measurements.
export const BODY_FIELDS = [
  ['weight','Peso','kg',1,999],['height','Altura','cm',30,250],
  ['fat','Gordura corporal','%',0,80],['muscle','Massa muscular medida','kg',0,300],
  ['water','Água corporal medida','L',0,150],
  ['waist','Cintura','cm',1,300],['hip','Quadril','cm',1,300],
  ['circ.neck','Pescoço','cm',1,300],['circ.shoulder','Ombros','cm',1,300],
  ['circ.chest','Tórax','cm',1,300],['circ.abdomen','Abdômen','cm',1,300],
  ['circ.armRight','Braço direito','cm',1,300],['circ.armLeft','Braço esquerdo','cm',1,300],
  ['circ.forearmRight','Antebraço direito','cm',1,300],['circ.forearmLeft','Antebraço esquerdo','cm',1,300],
  ['circ.thighRight','Coxa direita','cm',1,300],['circ.thighLeft','Coxa esquerda','cm',1,300],
  ['circ.calfRight','Panturrilha direita','cm',1,300],['circ.calfLeft','Panturrilha esquerda','cm',1,300],
  ...[['triceps','Tricipital'],['biceps','Bicipital'],['subscapular','Subescapular'],['suprailiac','Suprailíaca'],['abdominal','Abdominal'],['chest','Peitoral'],['midaxillary','Axilar média'],['thigh','Coxa'],['calf','Panturrilha']].map(([k,n])=>['skinfolds.'+k,n,'mm',0,150]),
  ['bia.visceral','Gordura visceral (índice)','',0,100],['bia.phaseAngle','Ângulo de fase','°',0,30],
  ['bia.protein','Proteína corporal','kg',0,100],['bia.minerals','Minerais','kg',0,30],
  ...[['armRight','Braço direito'],['armLeft','Braço esquerdo'],['trunk','Tronco'],['legRight','Perna direita'],['legLeft','Perna esquerda']].flatMap(([k,n])=>[
    ['segments.'+k+'.lean',n+' · massa magra','kg',0,300],['segments.'+k+'.fat',n+' · gordura','kg',0,300]
  ])
];
export const PHOTO_ANGLES = [['front','Frente'],['side-right','Lado direito'],['side-left','Lado esquerdo'],['back','Costas'],['unspecified','Sem ângulo informado']];
export function numberValue(value) {
  if (value==null || typeof value==='boolean' || !['string','number'].includes(typeof value) || String(value).trim()==='') return null;
  const n=Number(typeof value==='string'?value.replace(',','.'):value);
  return Number.isFinite(n)?n:null;
}
export function fieldValue(data,key) {
  const field=BODY_FIELDS.find(x=>x[0]===key);
  const n=numberValue(key.split('.').reduce((v,k)=>v?.[k],data));
  return n==null||field&&(n<field[3]||n>field[4])?null:n;
}
export function validDay(day) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day||''))return false;
  const d=new Date(day+'T12:00:00Z');
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===day;
}
export function recordDay(x) {return validDay(x.data?.day)?x.data.day:String(x.created_at||'').slice(0,10);}
export function visibleRecords(all,patientId,role,kinds=['assessment','measurement']) {
  if(!patientId)return [];
  return all.filter(x=>x.patient_id===patientId&&kinds.includes(x.kind)&&!x.data?.archived&&(role==='nutri'||x.visibility==='patient'))
    .slice().sort((a,b)=>recordDay(a).localeCompare(recordDay(b))||String(a.created_at).localeCompare(String(b.created_at))||String(a.id).localeCompare(String(b.id)));
}
export function composition(data={}) {
  const weight=fieldValue(data,'weight'),height=fieldValue(data,'height'),fat=fieldValue(data,'fat');
  const fatMass=weight!=null&&fat!=null?weight*fat/100:null;
  const waist=fieldValue(data,'waist'),hip=fieldValue(data,'hip');
  return {weight,height,fat,fatMass,leanMass:fatMass==null?null:weight-fatMass,
    bmi:weight!=null&&height!=null?weight/(height/100)**2:null,
    whr:waist!=null&&hip!=null?waist/hip:null,muscle:fieldValue(data,'muscle'),water:fieldValue(data,'water')};
}
export function difference(now,before) {return now==null||before==null?null:Math.round((now-before)*100)/100;}
export function safePhoto(value) {return typeof value==='string'&&value.length<=250000&&/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)?value:'';}
export function saveField(data,key,value) {
  const parts=key.split('.');let obj=data;
  for(const k of parts.slice(0,-1)){obj[k]={...(obj[k]&&typeof obj[k]==='object'?obj[k]:{})};obj=obj[k];}
  obj[parts.at(-1)]=value;
}
export function createAssessments(H,P) {
  const {esc,state,today,dateLabel,heading,render,modal,run}=H;
  const {pat,saveRecord,draftModal,imageFile,bind:bindPlatform}=P;
  const q=s=>document.querySelector(s),pro=()=>state().role==='nutri';
  let context='',selected='',baseline='',tab='body',metric='weight',angle='front',photoA='',photoB='';
  const all=()=>visibleRecords(state().records,state().selected,state().role);
  const photos=()=>visibleRecords(state().records,state().selected,state().role,['progress_photo']);
  const fmt=(n,d=1)=>n==null?'—':n.toLocaleString('pt-BR',{maximumFractionDigits:d,minimumFractionDigits:d});
  const date=x=>validDay(x)?dateLabel(x):'Data não informada';
  const delta=(n,u='')=>n==null?'Sem comparação':(n>0?'+':'')+fmt(n)+(u?' '+u:'');
  const button=(label,act,id='',cls='')=>'<button class="btn '+cls+'" data-x="'+act+'" data-id="'+esc(id)+'">'+label+'</button>';
  const options=(list,id)=>list.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===id?'selected':'')+'>'+esc(date(recordDay(x))+' · '+x.title)+'</option>').join('');
  function selection(){
    const key=(state().user?.id||'demo')+':'+state().role+':'+state().selected;
    if(context!==key){context=key;selected='';baseline='';photoA='';photoB='';tab='body';}
    const list=all(),current=list.find(x=>x.id===selected)||list.at(-1);
    selected=current?.id||'';
    const earlier=current?list.slice(0,list.indexOf(current)):[];
    const previous=earlier.find(x=>x.id===baseline)||earlier.at(-1);
    baseline=previous?.id||'';
    return {list,current,previous,earlier};
  }
  function measure(label,value,unit,diff,caption=''){
    return '<div class="body-stat"><span>'+label+'</span><strong>'+fmt(value)+'<small>'+unit+'</small></strong><p class="metric-delta">'+delta(diff,unit==='% '?'p.p.':unit)+'</p>'+(caption?'<small>'+caption+'</small>':'')+'</div>';
  }
  function chart(list){
    const defs={weight:['Peso','kg'],fat:['Gordura corporal','%'],leanMass:['Massa livre de gordura','kg']},[label,unit]=defs[metric];
    const points=list.map(x=>({x,value:composition(x.data)[metric]})).filter(p=>p.value!=null&&validDay(recordDay(p.x)));
    let html='<section class="card chart-card"><div class="card-head"><div><span class="eyebrow">Histórico das consultas</span><h2>Evolução corporal</h2></div><label class="sr-only" for="body-metric">Medida do gráfico</label><select id="body-metric">'+Object.entries(defs).map(([k,[n]])=>'<option value="'+k+'" '+(metric===k?'selected':'')+'>'+n+'</option>').join('')+'</select></div>';
    if(points.length<2)return html+'<div class="body-empty">O gráfico aparece com duas avaliações que tenham '+label.toLowerCase()+'. Cada ponto será uma medida registrada.</div></section>';
    const values=points.map(x=>x.value),min=Math.min(...values),max=Math.max(...values),pad=Math.max((max-min)*.2,metric==='fat'?1:.5),lo=Math.max(0,min-pad),hi=max+pad;
    const t0=Date.parse(recordDay(points[0].x)),t1=Date.parse(recordDay(points.at(-1).x));
    const x=(p,i)=>44+(t1===t0?i/(points.length-1):(Date.parse(recordDay(p.x))-t0)/(t1-t0))*584;
    const y=v=>158-(v-lo)/(hi-lo)*124;
    const line=points.map((p,i)=>(i?'L':'M')+x(p,i).toFixed(2)+' '+y(p.value).toFixed(2)).join(' ');
    html+='<svg class="body-chart" viewBox="0 0 660 206" role="img" aria-label="'+label+' por data. Valores disponíveis na tabela abaixo.">'+[0,.5,1].map(n=>'<line x1="44" x2="628" y1="'+(34+124*n)+'" y2="'+(34+124*n)+'" class="chart-grid"/><text x="2" y="'+(39+124*n)+'">'+fmt(hi-(hi-lo)*n)+'</text>').join('')+'<path d="'+line+'" class="chart-line"/>'+points.map((p,i)=>'<circle cx="'+x(p,i)+'" cy="'+y(p.value)+'" r="5" class="chart-point"><title>'+esc(date(recordDay(p.x))+': '+fmt(p.value)+' '+unit)+'</title></circle>').join('')+'<text x="44" y="192">'+esc(date(recordDay(points[0].x)))+'</text><text x="628" y="192" text-anchor="end">'+esc(date(recordDay(points.at(-1).x)))+'</text></svg>';
    return html+'<details class="chart-values"><summary>Ver valores do gráfico</summary><div class="table-scroll"><table><caption>'+label+' · '+unit+'</caption><thead><tr><th>Data</th><th>Avaliação</th><th>Valor</th></tr></thead><tbody>'+points.map(p=>'<tr><td>'+esc(date(recordDay(p.x)))+'</td><td>'+esc(p.x.title)+'</td><td>'+fmt(p.value)+' '+unit+'</td></tr>').join('')+'</tbody></table></div></details></section>';
  }
  function bodyMap(d,previous){
    const rows=[['circ.chest','Tórax',75],['waist','Cintura',103],['hip','Quadril',132],['circ.thighRight','Coxa direita',179],['circ.calfRight','Panturrilha direita',230]];
    const silhouette='<circle cx="140" cy="32" r="20"/><path d="M124 55Q110 56 100 65L78 124Q76 134 85 137Q93 139 97 128L114 91L114 123Q101 145 110 174L119 267Q120 281 130 279L139 185L142 185L151 279Q161 281 163 267L172 174Q181 145 166 123L166 91L183 128Q187 139 195 137Q204 134 202 124L180 65Q170 56 156 55Z"/>';
    return '<section class="card body-map-card"><div class="card-head"><div><span class="eyebrow">Mapa de medidas</span><h2>Seu corpo, em perspectiva</h2></div><span class="pill">cm</span></div><div class="body-map"><svg viewBox="0 0 280 290" aria-hidden="true"><g class="body-silhouette">'+silhouette+'</g>'+rows.map(([k,n,y])=>'<path d="M112 '+y+'H170" class="body-guide"/><circle cx="170" cy="'+y+'" r="3" class="chart-point"/>').join('')+'</svg><div class="body-map-values">'+rows.map(([k,n])=>'<div><span>'+n+'</span><b>'+fmt(fieldValue(d,k))+' <small>cm</small></b><small>'+delta(difference(fieldValue(d,k),fieldValue(previous||{},k)),'cm')+'</small></div>').join('')+'</div></div><p class="sub">Mapa ilustrativo. As medidas vêm da avaliação; as proporções da figura são fixas.</p></section>';
  }
  function compositionPanel(current,previous){
    const d=current.data,c=composition(d),b=composition(previous?.data);
    return '<div class="body-stats">'+measure('Peso',c.weight,'kg',difference(c.weight,b.weight))+measure('Gordura corporal',c.fat,'% ',difference(c.fat,b.fat),'Percentual registrado')+measure('Massa livre de gordura',c.leanMass,'kg',difference(c.leanMass,b.leanMass),'Calculada a partir de peso e gordura')+measure('Cintura',fieldValue(d,'waist'),'cm',difference(fieldValue(d,'waist'),fieldValue(previous?.data,'waist')))+'</div><div class="body-columns">'+bodyMap(d,previous?.data)+'<section class="card composition-card"><span class="eyebrow">Composição corporal</span><h2>Além do peso</h2><div class="composition-ring '+(c.fat==null?'unknown':'')+'" style="--fat:'+ (c.fat??0)+'"><div><strong>'+fmt(c.fat)+'<small>%</small></strong><span>gordura corporal</span></div></div><div class="composition-legend"><div><i></i><span>Massa de gordura <small>Calculada</small></span><b>'+fmt(c.fatMass)+' kg</b></div><div><i></i><span>Massa livre de gordura <small>Calculada; inclui água, ossos e outros tecidos</small></span><b>'+fmt(c.leanMass)+' kg</b></div><div><span>Massa muscular <small>Valor registrado</small></span><b>'+fmt(c.muscle)+' kg</b></div><div><span>Água corporal <small>Valor registrado</small></span><b>'+fmt(c.water)+' L</b></div></div></section></div>';
  }
  function measurements(current,previous){
    const d=current.data;
    const group=(title,fields)=>'<section class="card"><h2>'+title+'</h2><div class="table-scroll"><table class="measure-table"><thead><tr><th>Medida</th><th>Atual</th><th>Comparação</th><th>Variação</th></tr></thead><tbody>'+fields.map(([k,n,u])=>'<tr><th scope="row">'+n+'</th><td>'+fmt(fieldValue(d,k))+' '+u+'</td><td>'+fmt(fieldValue(previous?.data,k))+' '+u+'</td><td>'+delta(difference(fieldValue(d,k),fieldValue(previous?.data,k)),u==='%'?'p.p.':u)+'</td></tr>').join('')+'</tbody></table></div></section>';
    const c=composition(d);
    return group('Medidas e circunferências',BODY_FIELDS.filter(x=>!['skinfolds','bia','segments'].includes(x[0].split('.')[0])))+
      '<div class="body-columns">'+group('Dobras cutâneas',BODY_FIELDS.filter(x=>x[0].startsWith('skinfolds.')))+group('Bioimpedância',BODY_FIELDS.filter(x=>x[0].startsWith('bia.')))+'</div>'+
      group('Composição segmentar',BODY_FIELDS.filter(x=>x[0].startsWith('segments.')))+
      '<section class="card"><h2>Índices calculados</h2><div class="measure-grid"><div><small>IMC (kg/m²)</small><b>'+fmt(c.bmi)+'</b></div><div><small>Relação cintura/quadril</small><b>'+fmt(c.whr,2)+'</b></div></div><p class="sub">IMC = peso ÷ altura². Relação cintura/quadril = cintura ÷ quadril. A interpretação faz parte do acompanhamento profissional.</p></section>';
  }
  function photoPanel(){
    const allPhotos=photos(),list=allPhotos.filter(x=>(x.data.angle||'unspecified')===angle&&safePhoto(x.data.image));
    const after=list.find(x=>x.id===photoB)||list.at(-1);
    const earlier=after?list.slice(0,list.indexOf(after)):[];
    const before=earlier.find(x=>x.id===photoA)||earlier[0];
    photoA=before?.id||'';photoB=after?.id||'';
    return '<section class="card photo-comparison"><div class="card-head"><div><span class="eyebrow">Registro visual</span><h2>Fotos de evolução</h2></div>'+button('+ Adicionar foto','progress-photo')+'</div><p class="sub">Fotos visíveis para você e seu profissional. Compare o mesmo ângulo e procure repetir luz, distância e postura.</p><div class="angle-tabs" role="group" aria-label="Ângulo da foto">'+PHOTO_ANGLES.map(([id,label])=>'<button class="btn small '+(id===angle?'selected':'ghost')+'" data-body-angle="'+id+'" aria-pressed="'+(id===angle)+'">'+label+' <small>'+allPhotos.filter(x=>(x.data.angle||'unspecified')===id).length+'</small></button>').join('')+'</div>'+
      (after?'<div class="compare-controls"><label>Antes<select id="body-photo-before" '+(!before?'disabled':'')+'>'+(before?options(earlier,before.id):'<option>Adicione outra foto deste ângulo</option>')+'</select></label><label>Agora<select id="body-photo-after">'+options(list,after.id)+'</select></label></div><div class="photo-stage '+(!before?'single-photo':'')+'"><img src="'+esc(safePhoto(after.data.image))+'" alt="Foto de '+esc(date(recordDay(after)))+'">'+(before?'<div class="photo-before" id="photo-before-layer"><img src="'+esc(safePhoto(before.data.image))+'" alt="Foto de '+esc(date(recordDay(before)))+'"></div><div class="photo-divider" id="photo-divider"></div><span class="photo-tag before">Antes · '+esc(date(recordDay(before)))+'</span>':'')+'<span class="photo-tag after">Agora · '+esc(date(recordDay(after)))+'</span></div>'+(before?'<label class="photo-slider-label">Deslize para comparar<input type="range" min="0" max="100" value="50" id="body-photo-slider" aria-label="Divisão entre foto anterior e atual"></label>':'<p class="sub">Com duas fotos deste ângulo, você poderá comparar os registros deslizando sobre a imagem.</p>'):
      '<div class="body-empty photo-empty"><span class="photo-outline" aria-hidden="true">+</span><h3>Seu próximo registro começa aqui</h3><p>Nenhuma foto de '+esc(PHOTO_ANGLES.find(x=>x[0]===angle)?.[1].toLowerCase())+' foi adicionada.</p>'+button('Adicionar foto','progress-photo')+'</div>')+
      (allPhotos.length?'<details class="photo-history"><summary>Todas as fotos ('+allPhotos.length+')</summary><div class="photo-gallery">'+allPhotos.map(x=>'<article>'+ (safePhoto(x.data.image)?'<img loading="lazy" src="'+esc(safePhoto(x.data.image))+'" alt="'+esc(x.title)+'">':'<p>Imagem indisponível</p>')+'<b>'+esc(x.title)+'</b><small>'+esc(date(recordDay(x))+' · '+(PHOTO_ANGLES.find(a=>a[0]===(x.data.angle||'unspecified'))?.[1]||'Sem ângulo informado'))+'</small>'+((pro()||x.created_by===(state().demo?'patient-demo':state().user?.id))?button('Editar registro','record-edit',x.id,'small ghost'):'')+'</article>').join('')+'</div></details>':'')+'</section>';
  }
  function history(list) {
    return '<section class="card"><div class="card-head"><h2>Avaliações anteriores</h2><span class="pill">'+list.length+' registros</span></div>'+list.slice().reverse().map(x=>'<div class="assessment-history-row"><span class="history-dot"></span><div class="grow"><b>'+esc(x.title)+'</b><p>'+esc(date(recordDay(x)))+' · '+esc(x.data.source||'Origem não informada')+'</p><small>'+esc(x.visibility==='private'?'Privada do profissional':'Compartilhada com o paciente')+' · versão '+esc(x.version)+'</small></div>'+button('Ver avaliação','body-open',x.id,'small')+(pro()?button('Editar','record-edit',x.id,'small ghost'):'')+'</div>').join('')+'</section>';
  }
  function routine(){
    const logs=H.logs().slice().sort((a,b)=>b.day.localeCompare(a.day));
    return '<div class="body-columns"><section class="card"><div class="card-head"><h2>Pesos informados no check-in</h2><button class="btn small" data-action="checkin">Registrar check-in</button></div><p class="sub">Autorrelatos do paciente. As medidas da consulta permanecem nas avaliações profissionais.</p>'+
      (logs.filter(x=>numberValue(x.weight)>0).map(x=>'<div class="summary-line"><span>'+esc(date(x.day))+'</span><b>'+fmt(numberValue(x.weight))+' kg</b></div>').join('')||'<div class="body-empty">Nenhum peso registrado no check-in.</div>')+
      '</section><section class="card"><h2>Histórico da rotina</h2>'+ (logs.map(x=>'<div class="routine-history-row"><b>'+esc(date(x.day))+'</b><p>'+esc((x.meals||[]).length+' refeições · '+(numberValue(x.water_ml)||0)+' ml de água'+(x.followed?' · Plano seguido':''))+'</p>'+(x.sleep!=null?'<small>Sono: '+esc(x.sleep)+' h</small>':'')+(x.mood?'<small>'+esc(H.moodName(x.mood))+'</small>':'')+'<p class="document-text">'+esc(x.note||'')+'</p></div>').join('')||'<div class="body-empty">Seu histórico começa com o primeiro registro.</div>')+'</section></div>';
  }
  function view(){
    const {list,current,previous,earlier}=selection();
    let html=heading(pro()?'Acompanhamento individual':'Cada etapa da sua jornada',pro()?'Avaliação física e corporal':'Minha evolução',pro()?'Medidas, composição, fotos e histórico no mesmo acompanhamento.':'Acompanhe suas medidas e reconheça o seu progresso.',pro()?button('+ Nova avaliação','assessment','','primary'):'<button class="btn" data-page="achievements">Minhas conquistas</button>');
    if(pro())html+='<label class="patient-selector">Paciente<select id="body-patient">'+state().patients.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state().selected?'selected':'')+'>'+esc(x.name)+'</option>').join('')+'</select></label>';
    html+='<div class="body-tabs" role="group" aria-label="Área da evolução">'+[['body','Visão geral'],['measures','Medidas'],['photos','Fotos'],['history','Histórico'],...(!pro()?[['routine','Minha rotina']]:[])].map(([id,label])=>'<button class="'+(tab===id?'active':'')+'" data-body-tab="'+id+'" aria-pressed="'+(tab===id)+'">'+label+'</button>').join('')+'</div>';
    if(tab==='photos')return '<div class="assessment-app">'+html+photoPanel()+'</div>';
    if(tab==='routine'&&!pro())return '<div class="assessment-app">'+html+routine()+'</div>';
    if(!current)return '<div class="assessment-app">'+html+'<section class="card body-empty"><h2>A sua história vai aparecer aqui</h2><p>'+ (pro()?'Registre a primeira avaliação deste paciente para acompanhar as próximas medidas.':'Sua nutricionista ainda não compartilhou uma avaliação. Você já pode organizar suas fotos na aba Fotos.')+'</p>'+(pro()?button('Registrar avaliação','assessment','','primary'):'<button class="btn" data-page="chat">Conversar com minha nutri</button>')+'</section></div>';
    if(tab==='history')return '<div class="assessment-app">'+html+history(list)+'</div>';
    html+='<div class="assessment-toolbar"><div class="compare-controls"><label>Avaliação<select id="body-current">'+options(list,current.id)+'</select></label><label>Comparar com<select id="body-baseline" '+(!earlier.length?'disabled':'')+'>'+(earlier.length?options(earlier,previous?.id):'<option>Primeira avaliação</option>')+'</select></label></div><div class="actions">'+button('Relatório / PDF','assessment-print',current.id,'small')+(pro()?button('Editar','record-edit',current.id,'small ghost'):'')+'</div></div>';
    html+='<p class="assessment-source">'+esc(date(recordDay(current))+' · '+(current.data.source||'Origem da medida não informada'))+(current.data.method?' · '+esc(current.data.method):'')+(previous?' · Comparação: '+esc(previous.data.source||'origem não informada')+(previous.data.method?' / '+esc(previous.data.method):''):'')+' · '+(current.visibility==='private'?'Privada do profissional':'Compartilhada com o paciente')+'</p>';
    const age=numberValue(current.data.age),sex=current.data.sex==='F'?'Feminino':current.data.sex==='M'?'Masculino':'';
    if(age!=null||sex)html+='<p class="assessment-context sub">Informado na avaliação: '+esc([age!=null?age+' anos':'',sex].filter(Boolean).join(' · '))+'</p>';
    html+=tab==='measures'?measurements(current,previous):compositionPanel(current,previous)+chart(list.slice(0,list.indexOf(current)+1));
    html+='<section class="card professional-note"><span class="eyebrow">Olhar do profissional</span><h2>Observações da avaliação</h2><p>'+esc(current.data.text||'Nenhuma observação registrada nesta avaliação.')+'</p><small>'+esc(state().clinic.professional_name)+' · '+esc(state().clinic.crn)+'</small></section>';
    return '<div class="assessment-app">'+html+'</div>';
  }
  const input=(name,id,value='',type='text',extra='')=>'<label>'+name+'<input id="'+id+'" type="'+type+'" value="'+esc(value??'')+'" '+extra+'></label>';
  function edit(existing){
    if(!pro())throw Error('A avaliação é registrada pelo profissional.');
    const d=existing?.data||{};
    const fields=arr=>arr.map(([k,n,u,min,max])=>input(n+(u?' ('+u+')':''),'body-'+k,fieldValue(d,k),'number','min="'+min+'" max="'+max+'" step="0.1" inputmode="decimal"')).join('');
    const patientId=existing?.patient_id||state().selected;
    if(!pat(patientId))throw Error('Selecione um paciente antes de avaliar.');
    let body='<p class="form-context">Paciente: <b>'+esc(pat(patientId).name)+'</b></p>'+input('Título','body-title',existing?.title||'Avaliação corporal','text','required maxlength="200"')+
      '<div class="form-grid">'+input('Data da avaliação','body-day',d.day||(existing&&validDay(recordDay(existing))?recordDay(existing):today()),'date','required max="'+today()+'"')+input('Idade informada (anos)','body-age',d.age,'number','min="0" max="130" step="1"')+
      '<label>Sexo informado<select id="body-sex"><option value="">Não informado</option><option value="F" '+(d.sex==='F'?'selected':'')+'>Feminino</option><option value="M" '+(d.sex==='M'?'selected':'')+'>Masculino</option></select></label><label>Visibilidade<select id="body-visibility"><option value="patient" '+(existing?.visibility!=='private'?'selected':'')+'>Compartilhar com paciente</option><option value="private" '+(existing?.visibility==='private'?'selected':'')+'>Somente profissional</option></select></label></div>'+
      '<div class="form-grid">'+input('Origem / aparelho','body-source',d.source,'text','maxlength="200"')+input('Método / protocolo informado','body-method',d.method,'text','maxlength="200" placeholder="Ex.: bioimpedância do aparelho"')+'</div><fieldset class="assessment-fieldset"><legend>Dados principais</legend><div class="form-grid">'+fields(BODY_FIELDS.slice(0,5))+'</div></fieldset>';
    for(const [label,group] of [['Circunferências','circ'],['Dobras cutâneas','skinfolds'],['Bioimpedância complementar','bia'],['Composição segmentar','segments']]){
      const ff=BODY_FIELDS.filter(x=>x[0].startsWith(group+'.')||group==='circ'&&['waist','hip'].includes(x[0]));
      body+='<details class="assessment-form-section" '+(group==='circ'?'open':'')+'><summary>'+label+' <span>'+ff.filter(x=>fieldValue(d,x[0])!=null).length+' preenchidos</span></summary><div class="form-grid">'+fields(ff)+'</div></details>';
    }
    body+='<label>Observações do profissional<textarea id="body-text" maxlength="16000">'+esc(d.text||'')+'</textarea></label><p class="sub">Preencha apenas o que foi medido. Campos vazios permanecem não informados; nenhuma medida ou idade é presumida.</p>';
    draftModal(existing?'Editar avaliação':'Nova avaliação física e corporal',body,async()=>{
      const value=id=>document.getElementById('body-'+id).value.trim();
      const day=value('day');if(!validDay(day)||day>today())throw Error('Informe uma data válida até hoje.');
      const title=value('title');if(!title)throw Error('Preencha o título.');
      const data={...d,day,source:value('source'),method:value('method'),text:value('text'),sex:value('sex'),schemaVersion:2};
      const age=value('age');data.age=age===''?null:numberValue(age);if(age!==''&&(data.age==null||data.age<0||data.age>130||!Number.isInteger(data.age)))throw Error('Informe uma idade válida.');
      for(const [key,name,,min,max] of BODY_FIELDS){const raw=value(key),n=raw===''?null:numberValue(raw);if(raw!==''&&(n==null||n<min||n>max))throw Error('Confira o valor de '+name+'.');saveField(data,key,n);}
      await saveRecord(existing?.kind||'assessment',title,data,value('visibility'),existing,patientId);
    },'assessment:'+(existing?existing.id+':v'+existing.version:patientId));
  }
  function editPhoto(existing){
    if(existing&&!pro()&&existing.created_by!==(state().demo?'patient-demo':state().user?.id))throw Error('Você só pode editar suas próprias fotos.');
    const d=existing?.data||{},patientId=existing?.patient_id||state().selected;
    if(!pat(patientId))throw Error('Selecione um paciente.');
    const body='<p class="form-context">'+esc(pat(patientId).name)+'</p>'+input('Título','photo-title',existing?.title||'Registro de evolução','text','required maxlength="200"')+
      '<div class="form-grid">'+input('Data da foto','photo-day',d.day||(existing&&validDay(recordDay(existing))?recordDay(existing):today()),'date','required max="'+today()+'"')+'<label>Ângulo<select id="photo-angle">'+PHOTO_ANGLES.map(([k,n])=>'<option value="'+k+'" '+((d.angle||(existing?'unspecified':'front'))===k?'selected':'')+'>'+n+'</option>').join('')+'</select></label></div><label>Foto (PNG, JPG ou WebP)<input id="photo-file" type="file" accept="image/png,image/jpeg,image/webp" '+(!safePhoto(d.image)?'required':'')+'></label>'+
      (safePhoto(d.image)?'<img class="photo-edit-preview" src="'+esc(safePhoto(d.image))+'" alt="Foto atual"><p class="sub">Sem um novo arquivo, a foto atual será preservada.</p>':'')+
      '<label>Observação<textarea id="photo-text" maxlength="4000">'+esc(d.text||'')+'</textarea></label><p class="sub">A visibilidade original será preservada ao editar. Novas fotos são compartilhadas somente no acompanhamento entre paciente e profissional. A imagem é reduzida antes de salvar.</p>';
    draftModal('Foto de evolução',body,async()=>{
      const day=q('#photo-day').value,title=q('#photo-title').value.trim();if(!validDay(day)||day>today())throw Error('Informe uma data válida até hoje.');if(!title)throw Error('Preencha o título.');
      const file=q('#photo-file').files[0],image=file?await imageFile(file):safePhoto(d.image);if(!image)throw Error('Adicione uma foto.');
      photoA='';photoB='';
      await saveRecord('progress_photo',title,{...d,day,angle:q('#photo-angle').value,text:q('#photo-text').value.trim(),image},existing?.visibility||'patient',existing,patientId);
    },'progress-photo:'+(existing?existing.id+':v'+existing.version:patientId));
  }
  function detail(record){
    if(!record)return;
    if(!pro()&&(record.patient_id!==state().selected||record.visibility!=='patient'))throw Error('Avaliação indisponível para sua conta.');
    modal(esc(record.title),'<div class="assessment-app"><p class="sub">'+esc(date(recordDay(record)))+' · versão '+esc(record.version)+'</p>'+compositionPanel(record,null)+measurements(record,null)+'<p class="document-text">'+esc(record.data.text||'Sem observações registradas.')+'</p>'+(!record._history?button('Ver versões anteriores','record-history',record.id,'small ghost'):'')+'</div>');
    bindPlatform();
  }
  function print(record){
    if(!record)return;
    const list=visibleRecords(state().records,record.patient_id,state().role),index=list.findIndex(x=>x.id===record.id);
    if(index<0)throw Error('Esta avaliação não está disponível para sua conta.');
    const prev=record.id===selected?list.find(x=>x.id===baseline):list[index-1],data=record.data;
    const rows=BODY_FIELDS.filter(([k])=>fieldValue(data,k)!=null||fieldValue(prev?.data,k)!=null);
    const win=window.open('','_blank');if(!win)throw Error('Permita abrir a janela de impressão.');
    const c=composition(data);
    const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Relatório de avaliação corporal</title><style>body{font:14px system-ui;color:#20252b;max-width:860px;padding:30px;margin:auto}h1{font-size:26px}h2{margin-top:24px}table{border-collapse:collapse;width:100%}th,td{padding:9px 6px;text-align:left;border-bottom:1px solid #ddd}thead{display:table-header-group}tr{break-inside:avoid}p{line-height:1.6;white-space:pre-wrap}.muted{color:#53606b}button{padding:10px}@media print{button{display:none}body{padding:0}@page{margin:18mm}}</style><button onclick="window.print()">Imprimir / salvar PDF</button><h1>'+esc(state().clinic.name)+'</h1><h2>'+esc(record.title)+'</h2><p>'+esc(pat(record.patient_id)?.name)+' · '+esc(date(recordDay(record)))+'\nIdade informada: '+esc(numberValue(data.age)==null?'Não informada':data.age+' anos')+' · Sexo informado: '+esc(data.sex==='F'?'Feminino':data.sex==='M'?'Masculino':'Não informado')+'\nOrigem: '+esc(data.source||'Não informada')+'\nMétodo: '+esc(data.method||'Não informado')+'\nComparação: '+esc(prev?date(recordDay(prev))+' · '+prev.title+' · Origem: '+(prev.data.source||'Não informada')+' · Método: '+(prev.data.method||'Não informado'):'Primeira avaliação')+'</p><table><thead><tr><th>Medida</th><th>Atual</th><th>Anterior</th><th>Variação</th></tr></thead><tbody>'+rows.map(([k,n,u])=>'<tr><th>'+n+'</th><td>'+fmt(fieldValue(data,k))+' '+u+'</td><td>'+fmt(fieldValue(prev?.data,k))+' '+u+'</td><td>'+delta(difference(fieldValue(data,k),fieldValue(prev?.data,k)),u==='%'?'p.p.':u)+'</td></tr>').join('')+'</tbody></table><h2>Valores calculados</h2><p>IMC: '+fmt(c.bmi)+' kg/m² · Relação cintura/quadril: '+fmt(c.whr,2)+'\nMassa de gordura: '+fmt(c.fatMass)+' kg · Massa livre de gordura: '+fmt(c.leanMass)+' kg</p><p class="muted">As massas calculadas usam o peso e o percentual de gordura registrados. Massa livre de gordura inclui água, ossos e outros tecidos; não equivale à massa muscular. Campos não informados são exibidos como —.</p><h2>Observações do profissional</h2><p>'+esc(data.text||'Nenhuma observação registrada.')+'</p><p>'+esc(state().clinic.professional_name)+' · '+esc(state().clinic.crn)+'</p><p class="muted">Versão '+esc(record.version)+' · '+esc(record.visibility==='private'?'Registro privado do profissional':'Compartilhado com o paciente')+'</p></html>';
    win.document.write(html);win.document.close();
  }
  function bind(){
    document.querySelectorAll('[data-body-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.bodyTab;render();});
    document.querySelectorAll('[data-body-angle]').forEach(b=>b.onclick=()=>{angle=b.dataset.bodyAngle;photoA='';photoB='';render();});
    const change=(id,fn)=>{if(q(id))q(id).onchange=e=>{if(state().busy)return;fn(e.target.value);render();};};
    change('#body-current',v=>{selected=v;baseline='';});change('#body-baseline',v=>baseline=v);change('#body-metric',v=>metric=v);
    change('#body-patient',v=>state().selected=v);change('#body-photo-before',v=>photoA=v);change('#body-photo-after',v=>{photoB=v;photoA='';});
    if(q('#body-photo-slider'))q('#body-photo-slider').oninput=e=>{q('#photo-before-layer').style.clipPath='inset(0 '+(100-Number(e.target.value))+'% 0 0)';q('#photo-divider').style.left=e.target.value+'%';};
  }
  return {view,edit,editPhoto,detail,print,bind,photoPanel,all,photos,composition,fmt,
    open(id){selection();if(!all().some(x=>x.id===id))return;selected=id;baseline='';tab='body';render();},
    showPhotos(){selection();tab='photos';state().page=pro()?'assessments':'progress';render();}};
}
