/* Adaptador do app aluno. Histórico usa snapshots; nunca a ficha atual para
 * reconstituir prescrição antiga. Correções não passam pelos players/recompensas. */
(function(root){
  'use strict';
  function create(C){
    var H=root.MT_TREINO_HISTORICO, current=null, sync=null, timer=null, mounted=false;
    var scope=C.scope, ptr='tqWorkoutActive:'+encodeURIComponent(scope), actorKey='tqWorkoutActor:'+encodeURIComponent(scope);
    function uuid(){if(!root.crypto||!root.crypto.randomUUID)throw Error('IDENTIFICADOR_INDISPONIVEL');return root.crypto.randomUUID();}
    function clone(v){return JSON.parse(JSON.stringify(v));}
    function notify(message){var el=document.getElementById('hsStatus');if(el){el.textContent=message;el.hidden=!message;}if(C.error)C.error(message);}
    var actor=localStorage.getItem(actorKey);if(!actor){actor=uuid();localStorage.setItem(actorKey,actor);}
    var journal=H.create({storage:localStorage,scope:scope,actor:actor,active:C.active,changed:function(){clearTimeout(timer);timer=setTimeout(send,900);}});
    function send(){if(!sync||!C.active())return;sync.run().catch(function(){/* status mantém a pendência */});}
    if(C.token&&root.MT_TREINO_HISTORICO_SYNC)sync=root.MT_TREINO_HISTORICO_SYNC.create({storage:localStorage,scope:scope,token:C.token,active:C.active,journal:journal,rpc:C.rpc,status:function(s){notify(s==='sincronizado'?'Histórico sincronizado.':s==='enviando'?'Enviando histórico…':'Histórico salvo neste aparelho · sincronização pendente.');}});
    function safe(fn){try{if(!C.active())throw Error('IDENTITY_CHANGED');var out=fn();return out===undefined?true:out;}catch(e){notify(e.code==='STALE_REVISION'?'O registro mudou. Reabra o histórico para conferir as revisões.':e.code==='IDENTITY_CHANGED'?'O acesso mudou. Reabra seu app.':'Não foi possível guardar o histórico. Seus registros foram mantidos; libere espaço e tente novamente.');return false;}}
    function start(id,kind,date,prescribed,legacy){return safe(function(){journal.start({id:id,kind:kind,date:date,prescribed:legacy?{}:clone(prescribed),legacy:!!legacy});return true;});}
    function record(sid,target,value,reason){return safe(function(){var view=journal.session(sid),old=view.targets[target];value=clone(value);if(old&&old.conflict)throw Object.assign(Error('STALE_REVISION'),{code:'STALE_REVISION'});if(old&&H.canonical(old.value)===H.canonical(value))return true;
      journal.record({id:uuid(),session:sid,target:target,expected:old?old.heads:[],value:value,correction:!!old||view.finished,reason:reason||'Registro atualizado no treino'});return true;});}
    function finish(sid,value){return safe(function(){journal.finish({id:uuid(),session:sid,value:clone(value||{})});return true;});}
    function seedLegacy(p){
      if(!p.legacy)return;var data=C.read('ptdc',{}),events={};
      Object.keys(data).forEach(function(ex){(data[ex]||[]).forEach(function(r){if(r.d!==p.date||r.g!==2||r.sid||String(r.i||'').indexOf(p.fi+':')!==0)return;var parts=r.i.split(':'),target='set:'+parts[1]+':'+parts[2],id='legacy-seed:'+p.id+':'+parts[1]+':'+parts[2];if(journal.session(p.id).targets[target])return;
        events[id]={v:1,id:id,session:p.id,type:'result',at:null,actor:'legacy-import',legacyImport:true,target:target,parents:[],value:Object.assign({name:ex,series:Number(parts[2])+1},clone(r))};
      });});if(Object.keys(events).length)journal.ingest(events);
    }
    function muscle(fi,program){return safe(function(){var signature=JSON.stringify(program),pointerKey=ptr+':'+fi,p=null;try{p=JSON.parse(localStorage.getItem(pointerKey));}catch(_){}
      if(p&&p.date===C.today()&&p.fi===fi&&p.signature===signature){try{var v=journal.session(p.id);if(!v.finished){seedLegacy(p);current=p;return true;}}catch(_){} }
      var all=journal.list(),existing=all.find(function(v){return !v.finished&&v.kind==='musculacao'&&v.date===C.today()&&v.prescribed.signature===signature&&v.prescribed.fi===fi;});
      if(existing){current={id:existing.id,date:existing.date,fi:fi,signature:signature};localStorage.setItem(pointerKey,JSON.stringify(current));return true;}
      var legacy=!p&&(C.read('ptdc',{})&&Object.keys(C.read('ptdc',{})).some(function(ex){return C.read('ptdc',{})[ex].some(function(r){return r.d===C.today()&&r.g===2&&!r.sid&&String(r.i||'').indexOf(fi+':')===0;});}));
      if(!p&&!legacy){var previousCounts=C.read('ptsets_'+C.today(),{});legacy=program.it.some(function(it){return +previousCounts[it.k||C.exKey(it.e)]>0;});}var next={id:uuid(),date:C.today(),fi:fi,signature:signature,legacy:legacy};
      var prescription={name:program.n,fi:fi,signature:signature,program:clone(program),sets:[]};
      program.it.forEach(function(it,ei){C.series(it).forEach(function(s,si){prescription.sets.push({id:'set:'+ei+':'+si,name:it.e,series:si+1,prescribed:s});});});
      journal.start({id:next.id,kind:'musculacao',date:next.date,prescribed:legacy?{}:prescription,legacy:legacy});
      if(p&&!legacy){var sets=C.read('ptsets_'+C.today(),{});program.it.forEach(function(it){delete sets[it.k||C.exKey(it.e)];});if(C.save('ptsets_'+C.today(),sets)===false)throw Error('QUOTA');}
      seedLegacy(next);localStorage.setItem(pointerKey,JSON.stringify(next));current=next;return true;
    });}
    function match(r,fi){return !current||current.fi!==fi||r.sid===current.id||(current.legacy&&!r.sid);}
    function series(ei,si,r){if(!current)return true;return record(current.id,'set:'+ei+':'+si,Object.assign({name:r.name||'',series:si+1},clone(r)));}
    function completeMuscle(value){return !current||finish(current.id,value);}
    var importing=null;
    async function importLegacy(){
      if(importing)return importing;
      importing=(async function(){
        var known=journal.read(),sources=[];
        var loads=C.read('ptdc',{});Object.keys(loads).forEach(function(ex){(loads[ex]||[]).forEach(function(r){if(r.d!==C.today()&&(!r.sid||!known['start:'+r.sid]))sources.push({kind:'musculacao',source:ex,value:Object.assign({name:ex},r)});});});
        (C.read('ptcardio',[])||[]).forEach(function(r){if(!r.id||!known['start:'+r.id])sources.push({kind:'corrida',source:r.id||'',value:r});});
        var circuits=C.read('ptwodres',{});Object.keys(circuits).forEach(function(k){(circuits[k]||[]).forEach(function(r){if(!r.sid||!known['start:'+r.sid])sources.push({kind:'circuito',source:k,value:r});});});
        for(var i=0;i<sources.length;i++){
          if(!C.active())throw Error('IDENTITY_CHANGED');var src=sources[i],raw=clone(src.value),date=raw.d;
          if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
          var bytes=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(H.canonical(src)));
          var hash=Array.from(new Uint8Array(bytes)).map(function(b){return b.toString(16).padStart(2,'0');}).join(''),sid='legacy-'+hash;
          if(known['start:'+sid])continue;
          var startEvent={v:1,id:'start:'+sid,session:sid,type:'start',at:null,actor:'legacy-import',legacyImport:true,date:date,kind:src.kind,prescribed:{},legacy:true};
          var result={v:1,id:'legacy-result:'+hash,session:sid,type:'result',at:null,actor:'legacy-import',legacyImport:true,target:'record',parents:[],value:raw};
          var packet={};packet[startEvent.id]=startEvent;packet[result.id]=result;journal.ingest(packet);
        }
      })().finally(function(){importing=null;});return importing;
    }
    function modal(){var d=document.getElementById('hsDialog');if(d)return d;d=document.createElement('dialog');d.id='hsDialog';d.setAttribute('aria-label','Histórico dos treinos');document.body.appendChild(d);return d;}
    function el(tag,text,parent){var e=document.createElement(tag);if(text!=null)e.textContent=text;if(parent)parent.appendChild(e);return e;}
    function button(text,parent,fn){var b=el('button',text,parent);b.type='button';b.onclick=fn;return b;}
    function stamp(e){return e.at?new Date(e.at).toLocaleString('pt-BR'):'horário não preservado no registro antigo';}
    function display(value,parent,original){
      var names={name:'Exercício',n:'Treino',series:'Série',r:'Repetições',reps:'Repetições',kg:'Carga (kg)',rpe:'Esforço (RPE)',feito:'Série concluída',s:'Tempo (s)',seconds:'Tempo (s)',k:'Distância (km)',km:'Distância (km)',p:'Ritmo (min/km)',source:'Origem',origem:'Origem original',origemCorrecao:'Origem da correção',rodadas:'Rodadas',rounds:'Rodadas',rp:'Repetições por rodada',sp:'Tempos das rodadas (s)',du:'Duração (s)',v:'Placar',tp:'Tipo',cf:'Adaptação',ex:'Repetições extras',ob:'Observação',status:'Estado',parcial:'Parcial'};
      var dl=el('dl',null,parent);Object.keys(names).forEach(function(k){if(!Object.prototype.hasOwnProperty.call(value,k))return;var v=value[k];if(k==='r'&&typeof v==='string'&&(Object.prototype.hasOwnProperty.call(value,'k')||value.tp)){if(original&&value.tp){el('dt','Resumo salvo',dl);el('dd',v,dl);}return;}el('dt',names[k],dl);el('dd',v==null?'Não anotado':Array.isArray(v)?v.map(function(x){return x==null?'—':x;}).join(' / '):typeof v==='boolean'?(v?'Sim':'Não'):String(v),dl);});
      if(Array.isArray(value.etapas)){var det=el('details',null,parent);el('summary','Etapas registradas',det);value.etapas.forEach(function(e){var p=el('p',e.nome||'Etapa',det);el('span',' · '+e.segundos+' s · '+e.km+' km · '+e.status,p);});}
      if(value.rpartes||value.route||value.rota||(typeof value.r==='string'&&Object.prototype.hasOwnProperty.call(value,'k')))el('p','Trajeto original preservado neste registro.',parent);
    }
    function prescription(v,parent){el('h3','Prescrito na sessão',parent);if(v.legacy){el('p','Registro antigo: a prescrição completa não foi salva. Não usamos a ficha atual para preencher esse passado.',parent);return;}
      var p=v.prescribed;el('p',p.name||p.n||'Treino',parent);
      if(p.sets)p.sets.forEach(function(s){el('p',s.name+' · '+s.series+'ª série · '+s.prescribed.reps+' reps · '+(s.prescribed.carga==null?'carga não definida':s.prescribed.carga+' kg')+' · '+s.prescribed.descanso+' s de descanso',parent);});
      var raw=p.plan||p.receita||{},blocks=p.blocks&&p.blocks.length?p.blocks:(raw.bl||[]);
      if(v.kind==='corrida'){if(raw.br)el('p',raw.br,parent);blocks.forEach(function(b){el('p',(b.n||'Etapa')+' · '+(b.d||'')+(b.s?' · '+b.s+' s':'')+(b.km?' · '+b.km+' km':''),parent);});if(!blocks.length)el('p',[raw.t,raw.d?raw.d+' km':'',raw.tp?raw.tp+' min':'',raw.r?raw.r+' intervalos':'',raw.ti?raw.ti+' s ativo':'',raw.de?raw.de+' s recuperação':''].filter(Boolean).join(' · ')||'Treino livre',parent);}
      if(v.kind==='circuito'){el('p',[raw.t||raw.tipo||p.type,raw.min?raw.min+' min':'',(raw.rd||raw.rounds)?(raw.rd||raw.rounds)+' rodadas':'',(raw.wk||raw.work)?(raw.wk||raw.work)+' s ativo':'',(raw.rs||raw.rest)?(raw.rs||raw.rest)+' s descanso':''].filter(Boolean).join(' · '),parent);(raw.ms||raw.movs||[]).forEach(function(m){el('p',[m.q,m.n].filter(Boolean).join(' × '),parent);});var conf=p.config||{},keys=p.type==='fortime'?['wodCap']:p.type==='tabata'?['wodRounds','wodWork','wodRest']:['wodMin'];var labels={wodCap:'Limite (min)',wodRounds:'Rodadas',wodWork:'Trabalho (s)',wodRest:'Descanso (s)',wodMin:'Duração (min)'};if(keys.some(function(k){return conf[k]!=null;})){el('h4','Configuração usada no início',parent);keys.forEach(function(k){if(conf[k]!=null)el('p',labels[k]+': '+conf[k],parent);});}}
    }
    function detail(id,date){var d=modal(),v=journal.session(id);d.replaceChildren();button('Voltar às sessões',d,function(){open(date);});button('Fechar',d,function(){d.close();});el('h2',(v.prescribed.name||{musculacao:'Musculação',corrida:'Corrida',circuito:'Circuito'}[v.kind])+' · '+v.date,d);el('p',v.legacy?'Registro antigo: a sessão completa e o horário podem não estar disponíveis.':v.finished?'Sessão encerrada. Corrigir resultados não executa o treino novamente.':'Sessão em andamento. Consultar ou corrigir não reinicia o descanso.',d);prescription(v,d);el('h3','Realizado',d);
      var keys=Object.keys(v.targets);if(!keys.length)el('p','Nenhum resultado registrado nesta sessão.',d);
      keys.forEach(function(target){var t=v.targets[target],card=el('section',null,d);el('h4',t.value&&(t.value.name||t.value.n)||'Registro '+(keys.indexOf(target)+1),card);
        if(t.conflict){el('p','Há correções feitas em aparelhos diferentes. Confira as versões e escolha qual corrigir.',card);t.heads.forEach(function(h){var rev=t.revisions.find(function(x){return x.id===h;});display(rev.value,card);button('Conferir esta versão',card,function(){edit(id,target,rev.value,t.heads,date);});});}
        else{display(t.value,card);button('Corrigir resultado',card,function(){edit(id,target,t.value,t.heads,date);});}
        var hist=el('details',null,card);el('summary','Original e revisões ('+t.revisions.length+')',hist);t.revisions.forEach(function(r){el('h4',(r.type==='correction'?'Correção':'Registro')+' · '+stamp(r),hist);if(r.reason)el('p',r.reason,hist);display(r.value,hist,true);});
      });if(!d.open)d.showModal();}
    function edit(id,target,value,heads,date){var d=modal(),view=journal.session(id),copy=clone(value);d.replaceChildren();el('h2','Corrigir resultado',d);el('p','A data da sessão e o registro original serão preservados. Esta ação não conclui outro treino.',d);var form=el('form',null,d),fields=[];
      function field(key,label,max,integer){var wrap=el('label',label,form),input=el('input',null,wrap);input.type='number';input.min='0';input.max=String(max);input.step=integer?'1':'any';input.value=copy[key]==null?'':String(copy[key]);fields.push({key:key,input:input,max:max,integer:integer});}
      if(view.kind==='musculacao'){field('r','Repetições',1000,true);field('kg','Carga (kg)',2000,false);field('rpe','RPE (opcional)',10,false);}
      else if(view.kind==='corrida'){field('k','Distância (km)',500,false);field('s','Tempo (s)',86400,true);el('p','Uma correção de distância/tempo fica identificada como manual. Etapas e trajeto original são preservados.',form);}
      else{field('v',copy.tp==='fortime'?'Tempo do placar (s)':copy.tp==='amrap'?'Voltas realizadas':'Menor número de repetições por rodada',86400,true);field('ex','Repetições extras',10000,true);field('du','Duração real (s)',86400,true);if(Object.prototype.hasOwnProperty.call(copy,'rodadas'))field('rodadas','Rodadas realizadas',10000,true);if(Array.isArray(copy.rp))copy.rp.forEach(function(n,i){var key='rp_'+i;copy[key]=n;field(key,'Repetições da rodada '+(i+1),10000,true);});}
      var noteLabel=el('label','Motivo da correção',form),note=el('input',null,noteLabel);note.value='Completar informação esquecida';note.required=true;note.maxLength=500;var msg=el('p','',form);msg.setAttribute('role','status');var save=el('button','Salvar correção',form);save.type='submit';button('Cancelar',form,function(){detail(id,date);});var saving=false;
      form.onsubmit=function(e){e.preventDefault();if(saving)return;saving=true;save.disabled=true;try{
        fields.forEach(function(f){var raw=f.input.value.trim(),n=raw===''?null:Number(raw);if(n!==null&&(!Number.isFinite(n)||n<0||n>f.max||(f.integer&&!Number.isInteger(n))||(f.key==='rpe'&&n<1)))throw Error('Confira os valores informados.');copy[f.key]=n;});
        if(!note.value.trim())throw Error('Informe o motivo.');
        if(view.kind==='corrida'){copy.origemCorrecao='manual';if(copy.k>0&&copy.s>0){var pace=Math.round(copy.s/copy.k);copy.p=Math.floor(pace/60)+':'+String(pace%60).padStart(2,'0');}else copy.p=null;}
        if(view.kind==='circuito'&&Array.isArray(copy.rp)){copy.rp=copy.rp.map(function(_,i){var x=copy['rp_'+i];delete copy['rp_'+i];return x;});if(copy.tp==='emom'||copy.tp==='tabata'){var anotadas=copy.rp.filter(function(x){return x!=null;});copy.v=anotadas.length?Math.min.apply(null,anotadas):null;}}
        journal.record({id:uuid(),session:id,target:target,expected:heads,correction:true,reason:note.value.trim(),value:copy});detail(id,date);
      }catch(err){msg.textContent=err.code==='STALE_REVISION'?'Este registro mudou. Cancele e confira a nova revisão antes de salvar.':err.message==='IDENTITY_CHANGED'?'O acesso mudou. Reabra seu app.':err.message==='QuotaExceededError'||err.name==='QuotaExceededError'?'Sem espaço: a correção não foi salva. Seu preenchimento continua aqui.':err.message; saving=false;save.disabled=false;}};
    }
    function open(date){if(!C.active())return;var d=modal();d.replaceChildren();el('h2','Histórico dos treinos',d);button('Fechar',d,function(){d.close();});var label=el('label','Data da sessão',d),input=el('input',null,label);input.type='date';input.value=date||'';input.onchange=function(){open(input.value);};var rows=journal.list().filter(function(v){return !date||v.date===date;});if(!rows.length)el('p','Nenhuma sessão preservada para esta data. Registros antigos podem estar incompletos.',d);rows.forEach(function(v){var title=(v.prescribed.name||{musculacao:'Musculação',corrida:'Corrida',circuito:'Circuito'}[v.kind])+' · '+v.date+(v.legacy?' · registro antigo':'');button(title,d,function(){detail(v.id,date);});});if(!d.open)d.showModal();}
    function mount(){if(mounted)return;mounted=true;var anchor=document.getElementById('acRetomar');if(!anchor)return;var box=document.createElement('div');box.className='cardx';box.setAttribute('data-sec','treino');box.setAttribute('data-sec-off','1');var p=el('p','',box);p.id='hsStatus';p.setAttribute('role','status');button('Histórico por sessão · corrigir resultados',box,function(){importLegacy().then(function(){safe(function(){open('');});}).catch(function(){notify('Não foi possível abrir os registros antigos. Os originais foram mantidos.');});});anchor.after(box);var style=el('style',null,document.head);style.textContent='#hsDialog{width:min(640px,calc(100vw - 24px));max-height:85dvh;box-sizing:border-box;background:var(--bg,#18151f);color:var(--txt,#f4f2f7);border:1px solid var(--cor,#8c54f7);border-radius:16px;padding:20px;overflow:auto}#hsDialog::backdrop{background:#0009}#hsDialog button,#hsDialog input{font:inherit;min-height:44px;padding:10px;border:1px solid var(--cor,#8c54f7);border-radius:8px;background:var(--bg4,#302a3d);color:inherit;box-sizing:border-box}#hsDialog button{margin:6px 6px 6px 0;cursor:pointer}#hsDialog label{display:block;margin:12px 0}#hsDialog input{display:block;width:100%}#hsDialog section{border-top:1px solid var(--cor,#8c54f7);padding:12px 0}#hsDialog dl{display:grid;grid-template-columns:1fr 1fr;gap:6px}#hsDialog dd{margin:0;overflow-wrap:anywhere}#hsDialog details{margin:12px 0}';notify(C.token?'Histórico salvo neste aparelho · sincronização pendente.':'Histórico salvo neste aparelho.');send();}
    document.addEventListener('click',function(e){if(e.detail>1&&['gSerie','gSemRegistro','gFecharTreino','wpSalvar','crFim'].indexOf(e.target&&e.target.id)>=0){e.preventDefault();e.stopImmediatePropagation();}},true);
    window.addEventListener('online',send);
    return {journal:journal,start:start,record:record,finish:finish,muscle:muscle,match:match,series:series,completeMuscle:completeMuscle,id:function(){return current&&current.id;},date:function(){return current&&current.date||C.today();},open:function(date){return importLegacy().then(function(){open(date);});},importLegacy:importLegacy,mount:mount,notify:notify};
  }
  root.MT_TREINO_HISTORICO_APP={create:create};
})(typeof self!=='undefined'?self:this);
