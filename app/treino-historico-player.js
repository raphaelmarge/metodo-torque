/* Integração síncrona dos players. Toda escrita ocorre com uma concessão
 * exclusiva do MESMO Web Lock usado por createLocked. A concessão termina
 * ao sair da página; outra aba consulta, mas não escreve enquanto isso.
 * Fonte incorporada no builder por tools/treino-historico/regen-runtime.js. */
(function (root) {
  'use strict';
  function makePlayer(C) {
    var core = root.MT_TREINO_HISTORICO, lease = false, release = null, acquiring = false, disposed = false, leaseRequest = null, waiting = !!C.waitFor, epoch = 0;
    var prefix = 'tqWorkoutPlayer:' + encodeURIComponent(C.scope) + ':', sync, timer, message = '', localFailure = '', localWrites = 0, syncState = C.demo ? 'demo' : 'local';
    function uid() { if(crypto.randomUUID)return crypto.randomUUID();var bytes=new Uint8Array(16);crypto.getRandomValues(bytes);bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;var hex=Array.from(bytes,function(b){return b.toString(16).padStart(2,'0');}).join('');return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20); }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function same(a, b) { return core.canonical(a) === core.canonical(b); }
    function raw(k, d) { var v = C.storage.getItem(k); return v === null ? d : JSON.parse(v); }
    function check() { if (!C.active()) throw new Error('IDENTITY_CHANGED'); if (disposed) throw new Error('IDENTITY_CHANGED'); if (!lease) throw new Error((acquiring||waiting)?'LOCK_PENDING':'OTHER_TAB'); }
    function storageError(e) { return ['QuotaExceededError','NS_ERROR_DOM_QUOTA_REACHED','SecurityError'].indexOf(e.name)>=0 || ['LOCAL_STORAGE_FAILED','WRITE_NOT_CONFIRMED','CHECKPOINT_PENDING'].indexOf(e.code || e.message)>=0; }
    function status(s, state) { if(disposed)return;message = localFailure || s;if(state)syncState=state; var el = document.getElementById('thStatus'); if (el) {el.textContent = message;el.dataset.estado=localFailure?'erro-local':syncState;}if(C.syncChanged)C.syncChanged(); }
    function error(e) {
      if(disposed)return false;
      var m = { LOCK_PENDING: 'Preparando o histórico. Aguarde um instante antes de iniciar.', OTHER_TAB: 'Outra aba está editando este aluno. Feche-a e toque em Habilitar edição.', LOCKS_UNAVAILABLE: 'Este navegador não oferece o bloqueio necessário para salvar o histórico.', IDENTITY_CHANGED: 'O acesso mudou. Reabra o app deste aluno.', STALE_REVISION: 'O registro mudou. Reabra a série ou o editor para conferir a revisão atual.', CONFLICT: 'Há revisões diferentes. Abra o histórico e escolha a correção.', CHECKPOINT_PENDING: 'Não foi possível preparar a sessão. Libere espaço e tente novamente; a sessão anterior foi preservada.', SNAPSHOT_CHANGED: 'A ficha mudou. Consulte a sessão antiga por data ou use Novo treino desta ficha para outra execução.' };
      if (storageError(e)) localFailure = 'Não foi possível salvar o histórico neste aparelho. Seus registros anteriores foram mantidos. Libere espaço e repita a ação.';
      status(m[e.code || e.message] || 'Não foi possível salvar o histórico. Seus registros anteriores foram mantidos; libere espaço e tente novamente.');
      if (C.error) C.error(message);
      return false;
    }
    // Leituras são permitidas sem concessão; o proxy impede qualquer escritor
    // de usar a primitiva síncrona fora do lock, incluindo respostas da rede.
    var guarded = { get length() { return C.storage.length; }, key: function (i) { return C.storage.key(i); }, getItem: function (k) { return C.storage.getItem(k); }, setItem: function (k,v) { check(); try { C.storage.setItem(k,v);localWrites++; } catch(e) { var failure=new Error('Não foi possível salvar neste aparelho. Libere espaço e repita a ação.');failure.code='LOCAL_STORAGE_FAILED';throw failure; } } };
    // Uma confirmação remota não resolve uma ação que falhou antes de ser salva.
    // O aviso só é liberado depois de uma nova operação local concluída.
    function localSaved() { if(!localFailure)return;localFailure='';status(C.demo?'Demonstração · histórico simulado nesta visita.':sync?'Histórico salvo neste aparelho · sincronização pendente.':'Histórico salvo neste aparelho.',C.demo?'demo':sync?'pendente':'local');schedule(); }
    function localOperation(fn) { return function () { var before=localWrites,result=fn.apply(this,arguments);if(result===true&&localWrites>before)localSaved();return result; }; }
    var journal = core.create({ storage: guarded, scope: C.scope, actor: uid(), active: C.active, changed: function () { status(C.demo?'Demonstração · histórico simulado nesta visita.':sync?'Histórico salvo neste aparelho · sincronização pendente.':'Histórico salvo neste aparelho.',C.demo?'demo':sync?'pendente':'local'); schedule(); } });
    function schedule() { clearTimeout(timer); if (sync) timer = setTimeout(function () { synchronize(); }, 1800); }
    function synchronize() {
      if (!sync || !lease || !C.active()) return Promise.resolve(false);
      return sync.run().then(function () { return true; }).catch(function (e) {
        var messages={NETWORK_ERROR:'Falha de rede. Tente novamente quando houver conexão.',REMOTE_DENIED:(e.operation==='read'?'Leitura':'Envio')+' do histórico negado pelo serviço. Confira o acesso do aluno.',RPC_UNAVAILABLE:'Serviço de histórico indisponível. As RPCs precisam de homologação.',REMOTE_HTTP_ERROR:'O serviço de histórico respondeu com erro.',INVALID_SYNC_RESPONSE:'O serviço devolveu uma resposta inválida.'};
        status('Histórico preservado neste aparelho. '+(messages[e.code||e.message]||'Sincronização pendente; tente novamente.'),'erro');return false;
      });
    }
    if (!C.demo && C.rpc && C.token) sync = root.MT_TREINO_HISTORICO_SYNC.create({ scope: C.scope, storage: guarded, journal: journal, token: C.token, active: function () { return lease && C.active(); }, rpc: C.rpc, status: function (s) { status(s === 'sincronizado' ? 'Histórico sincronizado.' : s==='enviando'?'Enviando histórico…':'Histórico salvo neste aparelho · envio pendente.',s); } });
    function acquire() {
      if (disposed || waiting || lease || acquiring) return;
      if (!navigator.locks) { error(new Error('LOCKS_UNAVAILABLE')); return; }
      acquiring = true;var acquisition=epoch;
      leaseRequest = navigator.locks.request('tqWorkoutJournal:' + encodeURIComponent(C.scope), { ifAvailable: true }, function (lock) {
        if(disposed||acquisition!==epoch)return;
        acquiring = false;
        if (!lock) { error(new Error('OTHER_TAB')); return; }
        if (disposed || !C.active()) return;
        lease = true; status(C.demo?'Demonstração · histórico simulado nesta visita.':'Histórico salvo neste aparelho.',C.demo?'demo':'local'); schedule();
        return new Promise(function (resolve) { release = resolve; });
      }).catch(error);
    }
    function stop() { epoch++;acquiring=false;lease = false; clearTimeout(timer); if (release) release(); release = null; }
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', acquire);
    window.addEventListener('online', schedule);
    function identityChanged() { if (!C.active()) { stop(); error(new Error('IDENTITY_CHANGED')); } }
    window.addEventListener('storage', identityChanged);
    function dispose() { disposed=true;stop();window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',acquire);window.removeEventListener('online',schedule);window.removeEventListener('storage',identityChanged);return leaseRequest||Promise.resolve(); }
    if(C.waitFor)Promise.resolve(C.waitFor).then(function(){waiting=false;acquire();});else acquire();
    function begin(kind, id, date, prescribed, legacy) {
      try {
        check();
        if(legacy&&!journal.read()['start:'+id]) {
          var event={v:1,id:'start:'+id,session:id,type:'start',at:null,actor:'legacy-import',legacyImport:true,date:date,kind:kind,prescribed:{},legacy:true},packet={};packet[event.id]=event;journal.ingest(packet);
        } else journal.start({ id: id, kind: kind, date: date, prescribed: legacy ? {} : clone(prescribed), legacy: !!legacy });
        return true;
      } catch (e) { return error(e); }
    }
    function legacyResult(sid,target,value) {
      check();var previous=journal.session(sid).targets[target];if(previous)return previous.heads;
      var event={v:1,id:'legacy-result:'+sid+':'+target,session:sid,type:'result',at:null,actor:'legacy-import',legacyImport:true,target:target,parents:[],value:clone(value)},packet={};packet[event.id]=event;journal.ingest(packet);
      return journal.session(sid).targets[target].heads;
    }
    function muscleKey(fi, date) { return prefix + 'muscle:' + date + ':' + fi; }
    function muscleId(fi, date) { return C.storage.getItem(muscleKey(fi,date)); }
    function pendingMuscleKey(fi,date) { return prefix+'newMuscle:'+date+':'+fi; }
    function prepareMuscle(fi,date) {
      var key=pendingMuscleKey(fi,date), pending=raw(key,null);if(!pending)return true;
      check();
      if(!begin('musculacao',pending.id,date,pending.prescribed,false))return false;
      guarded.setItem(muscleKey(fi,date),pending.id);
      if(!C.resetMuscle||C.resetMuscle(fi,date)===false)throw new Error('CHECKPOINT_PENDING');
      check();C.storage.removeItem(key);if(C.storage.getItem(key)!==null)throw new Error('CHECKPOINT_PENDING');return true;
    }
    function newMuscle(fi,prescribed,date) {
      try {
        check();var key=pendingMuscleKey(fi,date);
        // A operação fica pendente até o snapshot, apontador e contadores serem
        // confirmados. Reload/retry reutiliza o mesmo UUID, sem apagar a sessão anterior.
        if(!raw(key,null))guarded.setItem(key,JSON.stringify({id:uid(),prescribed:clone(prescribed)}));
        return prepareMuscle(fi,date);
      }catch(e){return error(e);}
    }
    function beginMuscle(fi, prescribed, date) {
      try {
        check();if(!prepareMuscle(fi,date))return false;
        var id=muscleId(fi,date),events=journal.read(),s=id&&events['start:'+id]?journal.session(id):null;
        if(s&&!s.legacy&&!same(s.prescribed,clone(prescribed)))throw new Error('SNAPSHOT_CHANGED');
        if(!id){id=uid();guarded.setItem(muscleKey(fi,date),id);}
        var legacy=s?s.legacy:!!(C.legacy&&C.legacy(date).some(function(r){return r._kind==='musculacao'&&r.g===2&&typeof r.i==='string'&&r.i.indexOf(fi+':')===0&&!r.hid;}));
        return begin('musculacao',id,date,prescribed,legacy);
      }catch(e){return error(e);}
    }
    function belongs(reg,fi,date) {
      var id=muscleId(fi,date);if(!id)return !reg.hid;
      if(reg.hid)return reg.hid===id;
      var event=journal.read()['start:'+id];return !!(event&&event.legacy);
    }
    function volume(fi,date) {
      var total=0;
      list(date).filter(function(s){return s.kind==='musculacao';}).forEach(function(s){Object.keys(s.targets).forEach(function(target){
        var t=s.targets[target],v=t.value;if(!v||t.conflict||!v.feito||!v.i||target!==v.i||v.i.indexOf(fi+':')!==0)return;
        if(v.kg!=null&&Number.isFinite(+v.kg)&&+v.kg>=0&&v.r!=null&&Number.isFinite(+v.r)&&+v.r>0)total+=+v.kg*+v.r;
      });});return total;
    }
    function heads(fi, date, target) { var id = muscleId(fi,date); if (!id) return []; var t = journal.session(id).targets[target]; return t ? t.heads : []; }
    function record(sid, target, value, expected, reason) {
      check(); var s = journal.session(sid), t = s.targets[target];
      if (t && !t.conflict && same(t.value,value)) return t.heads;
      if (t && t.conflict) throw new Error('CONFLICT');
      journal.record({ id: uid(), session: sid, target: target, value: clone(value), expected: expected || (t ? t.heads : []), correction: !!t || s.finished, reason: reason || 'Correção durante o treino' });
      return journal.session(sid).targets[target].heads;
    }
    function muscle(reg, exercise, previous, expected) {
      try {
        check(); var fi = +reg.i.split(':')[0], id = muscleId(fi,reg.d);
        if (!id) { id = uid(); guarded.setItem(muscleKey(fi,reg.d),id); }
        if (!journal.read()['start:'+id] && !begin('musculacao',id,reg.d,{},true)) return false;
        var value = Object.assign({},clone(reg),{ exercise: exercise }); delete value.hid;
        if (previous && !journal.session(id).targets[reg.i]) { var old = Object.assign({},clone(previous),{ exercise: exercise }); delete old.hid; legacyResult(id,reg.i,old); expected = null; }
        record(id,reg.i,value,expected); reg.hid = id; return true;
      } catch (e) { return error(e); }
    }
    function finishMuscle(fi, date) {
      try { check(); var id = muscleId(fi,date); if (id) journal.finish({ id: 'finish:' + id, session: id, value: { date: date } }); return true; } catch (e) { return error(e); }
    }
    function finish(kind, id, date, value) {
      try {
        check(); var events = journal.read();
        if (!events['start:' + id] && !begin(kind,id,date,{},true)) return false;
        if (!journal.session(id).targets.result) record(id,'result',clone(value)); journal.finish({ id: 'finish:' + id, session: id, value: { date: date } }); return true;
      } catch (e) { return error(e); }
    }
    function current(sid, target, fallback) {
      try { var t = journal.session(sid).targets[target]; return t && !t.conflict ? clone(t.value) : fallback; } catch (_) { return fallback; }
    }
    function project(key, data) {
      if (!['ptdc','ptcardio','ptwodres'].includes(key)) return data;
      var sessions=null;
      function row(r) {
        var sid=r.hid||r.id||r.sid;if(!sid)return r;
        if(!sessions){sessions={};journal.list().forEach(function(s){sessions[s.id]=s;});}
        var s=sessions[sid],t=s&&s.targets[key==='ptdc'?r.i:'result'];
        if(!t||t.conflict||!t.value)return r;var v=clone(t.value);delete v.exercise;if(r.hid)v.hid=r.hid;return v;
      }
      if(Array.isArray(data))return data.map(row);
      var out={};Object.keys(data).forEach(function(k){out[k]=Array.isArray(data[k])?data[k].map(row):data[k];});return out;
    }
    function list(date) { return journal.list().filter(function (s) { return !date || s.date === date; }); }
    function packet() { check();return journal.packet(); }
    function node(tag,text,parent) { var el=document.createElement(tag); if(text!=null) el.textContent=text; if(parent) parent.appendChild(el); return el; }
    function button(text,parent,click) { var b=node('button',text,parent); b.type='button'; b.className='sec'; b.onclick=click; return b; }
    var labels = { voltas:'Voltas concluídas', kg:'Carga (kg)', r:'Repetições', rpe:'RPE', s:'Tempo (segundos)', k:'Distância (km)', p:'Ritmo informado', du:'Duração (segundos)', v:'Resultado', ex:'Repetições extras', rp:'Repetições por rodada', ob:'Observação', tempoBase:'Base do tempo', origem:'Origem da medição', origemCorrecao:'Origem da correção', n:'Nome', e:'Exercício', exercise:'Exercício', feito:'Concluída', serie:'Série', etapas:'Etapas', rodadas:'Rodadas', tp:'Modalidade de circuito', prescricao:'Prescrição registrada', rpartes:'Trechos da rota', fc:'FC média', fcx:'FC máxima' };
    function show(value,parent,context) {
      context=context||{};
      function scalar(v){return v==null?'Não registrado':typeof v==='boolean'?(v?'Sim':'Não'):v===''?'Não anotado':String(v);}
      if(value===null||typeof value!=='object'){node('span',scalar(value),parent);return;}
      if(Array.isArray(value)){value.forEach(function(v,i){var item=node('section',null,parent);node('h5',(context.item||'Item')+' '+(i+1),item);show(v,item,context);});if(!value.length)node('p','Sem registros.',parent);return;}
      var names={d:'Data',m:'Modalidade',cf:'Como fez',nf:'Não terminou',parcial:'Encerrado antes',status:'Situação',sp:'Tempos das voltas (s)',ms:'Movimentos',it:'Exercícios',q:'Repetições prescritas',reps:'Repetições',carga:'Carga (kg)',descanso:'Descanso (s)',seriesDetalhadas:'Prescrição por série',receita:'Circuito prescrito',plano:'Plano prescrito',blocos:'Etapas prescritas',config:'Configuração da sessão',tipo:'Tipo',segundos:'Tempo (s)',km:'Distância (km)',nome:'Nome',indice:'Número da etapa (a partir de zero)',alvoSegundos:'Tempo prescrito (s)',alvoKm:'Distância prescrita (km)',mod:'Modalidade',metaD:'Meta de distância',metaT:'Meta de tempo',aq:'Aquecimento',obs:'Orientação',cap:'Limite de tempo',min:'Minutos',rd:'Rodadas',wk:'Trabalho (s)',rs:'Descanso (s)',mv:'Quantidade de movimentos',s:'Tempo (s)',t:'Tipo de treino',tp:'Meta de tempo (min)',ti:'Duração do tiro (s)',de:'Recuperação (s)',dt:'Orientação',series:'Séries',wodMin:'Duração (min)',wodCap:'Limite (min)',wodRounds:'Rodadas',wodWork:'Trabalho (s)',wodRest:'Descanso (s)'};
      var dl=node('dl',null,parent);dl.className='th-values';
      Object.keys(value).forEach(function(k){
        if(['hid','id','sid','i','g','_kind','indice'].indexOf(k)>=0||context.prescribed&&k==='k')return;
        var v=value[k],label=names[k]||labels[k]||k;
        if(k==='d'&&typeof v==='number')label='Descanso (s)';
        if(k==='s'&&context.prescribed&&context.kind==='musculacao')label='Séries';
        if(k==='r')label=context.kind==='corrida'&&!context.prescribed?'Trajeto registrado':context.kind==='circuito'&&!context.prescribed?'Resumo do encerramento':'Repetições';
        if(k==='tp'&&context.kind==='circuito')label='Tipo de circuito';
        if(k==='prescricao'&&typeof v==='string'){try{v=JSON.parse(v);}catch(_){}}
        if(v&&typeof v==='object'){
          var dd=node('dd',null,dl);dd.className='th-structured';var details=node('details',null,dd);node('summary',label,details);
          show(v,details,{kind:context.kind,prescribed:context.prescribed||k==='prescricao',item:{etapas:'Etapa',blocos:'Etapa',rp:'Rodada',sp:'Volta',ms:'Movimento',it:'Exercício',seriesDetalhadas:'Série'}[k]||'Item'});
        }else{node('dt',label,dl);node('dd',scalar(v),dl);}
      });
    }
    function edit(s,target,revision,parent) {
      var t=s.targets[target], value=clone(revision.value), expected=t.heads.slice();
      var operation=uid();
      var form=node('form',null,parent); form.className='th-edit';
      node('h4','Corrigir resultado',form);
      var fields=s.kind==='musculacao'?['r','kg','rpe']:s.kind==='corrida'?['s','k']:(target==='progress'?['voltas','ex','du','rp','kg','ob']:['v','ex','du','rp','kg','ob']);
      var inputs={}; fields.forEach(function(k){var lab=node('label',labels[k],form),inp=node('input',null,lab); inputs[k]=inp; inp.name=k; inp.value=value[k]==null?'':Array.isArray(value[k])?value[k].map(function(x){return x==null?'':x;}).join(','):String(value[k]); inp.inputMode=k==='ob'?'text':'decimal';});
      var intervals=[];
      if(s.kind==='corrida'&&Array.isArray(value.etapas))value.etapas.forEach(function(step,i){
        if(!step)return;var fieldset=node('fieldset',null,form);node('legend','Etapa '+(i+1)+' · '+(step.nome||''),fieldset);
        ['segundos','km'].forEach(function(k){if(!Object.prototype.hasOwnProperty.call(step,k))return;var label=node('label',k==='km'?'Distância da etapa (km)':'Tempo da etapa (segundos)',fieldset),input=node('input',null,label);input.name='etapa-'+i+'-'+k;input.value=String(step[k]);input.inputMode='decimal';intervals.push({i:i,k:k,input:input});});
      });
      var reasonLabel=node('label','Motivo da correção',form),reason=node('input',null,reasonLabel);reason.required=true;reason.maxLength=500;reason.name='reason';
      var err=node('p','',form);err.setAttribute('role','alert');
      var save=node('button','Salvar correção',form);save.type='submit';save.className='prin';button('Cancelar',form,function(){form.remove();});
      form.onsubmit=function(e){e.preventDefault();save.disabled=true;var beforeWrites=localWrites;
        try {
          check(); if(!reason.value.trim())throw new Error('Informe o motivo.');
          var updated=clone(value);
          fields.forEach(function(k){var str=inputs[k].value.trim();
            if(k==='ob'){updated[k]=str.slice(0,300);return;}
            if(k==='rp'){if(!str){delete updated[k];return;}updated[k]=str.split(',').map(function(x){if(!x.trim())return null;var n=Number(x);if(!Number.isInteger(n)||n<0||n>10000)throw new Error('Confira as repetições por rodada.');return n;});return;}
            if(!str){if(target==='progress'&&['s','k','du','voltas'].indexOf(k)>=0)throw new Error('Preencha tempo, distância e voltas observadas para retomar.');if(k==='kg')updated[k]=null;else delete updated[k];return;}
            var n=Number(str.replace(',','.')); if(!Number.isFinite(n)||n<0||n>1000000||(k==='r'&&(!Number.isInteger(n)||n>1000))||(k==='voltas'&&!Number.isInteger(n))||(k==='kg'&&n>2000)||(k==='rpe'&&(n<1||n>10)))throw new Error('Confira os valores informados.');updated[k]=n;
          });
          intervals.forEach(function(field){var str=field.input.value.trim(),n=Number(str.replace(',','.'));if(!str||!Number.isFinite(n)||n<0)throw new Error('Confira os valores das etapas.');updated.etapas[field.i][field.k]=n;});
          // Distância/tempo corrigidos não recalculam etapas, GPS, FC nem a
          // semântica tempoBase recebida do player (incluindo PR #870).
          if(s.kind==='corrida' && (updated.s!==value.s||updated.k!==value.k)) { updated.origemCorrecao='manual'; updated.p=updated.s!=null&&updated.k>0?(Math.floor(Math.round(updated.s/updated.k)/60)+':'+String(Math.round(updated.s/updated.k)%60).padStart(2,'0')):null; }
          if(s.kind==='corrida' && !same(updated.etapas||[],value.etapas||[])) updated.origemCorrecao='manual';
          if(target==='progress'&&journal.session(s.id).finished)throw new Error('A sessão foi encerrada. Reabra o resultado final para corrigir.');
          journal.record({id:operation,session:s.id,target:target,expected:expected,correction:true,reason:reason.value.trim(),value:updated});
          if(target==='progress'&&C.applyLive){
            var latest=journal.session(s.id).targets[target];if(latest.heads.length!==1||latest.heads[0]!==operation)throw new Error('O registro mudou. Reabra o editor.');
            var applied=C.applyLive(s.kind,s.id,updated);if(applied===false)throw new Error('A revisão foi preservada, mas o checkpoint não foi salvo. Mantenha a sessão pausada e tente novamente.');
            if(applied===true)guarded.setItem(prefix+'liveAck:'+s.id,JSON.stringify(operation));
          }
          if(localWrites>beforeWrites)localSaved();render();
        }catch(ex){if(storageError(ex))error(ex);err.textContent=ex.code==='STALE_REVISION'?'O registro mudou. Cancele e abra novamente antes de corrigir.':ex.message==='OTHER_TAB'?'Feche a outra aba e habilite a edição.':ex.message;save.disabled=false;}
      };
      reason.focus();
    }
    var panel,dateInput,results;
    function render() {
      if(!results)return; results.replaceChildren();
      try {
        var sessions=list(dateInput.value);
        if(!sessions.length)node('p','Nenhuma sessão com histórico registrada nesta data.',results);
        sessions.forEach(function(s){
          var article=node('article',null,results);article.className='th-session';article.dataset.kind=s.kind;article.dataset.session=s.id;
          node('h3',s.date.split('-').reverse().join('/')+' · '+({musculacao:'Musculação',corrida:'Corrida',circuito:'Circuito'}[s.kind]),article);
          node('p',(s.finished?'Sessão encerrada':s.startedAt===null?'Registro anterior · encerramento não registrado':'Sessão iniciada · encerramento não registrado')+' · '+(s.startedAt===null?'horário não preservado no registro antigo':'início '+new Date(s.startedAt).toLocaleTimeString('pt-BR')),article);
          var prescribed=node('details',null,article);node('summary','Prescrição daquela data',prescribed);
          if(s.legacy)node('p','Prescrição histórica não registrada. O plano atual não foi usado para preencher esta sessão.',prescribed);else show(s.prescribed,prescribed,{kind:s.kind,prescribed:true});
          Object.keys(s.targets).forEach(function(target){var t=s.targets[target];
            if(target==='progress'&&s.finished){var past=node('details',null,article);node('summary','Revisões durante a execução',past);t.revisions.forEach(function(r){node('p',r.at+(r.reason?' · '+r.reason:''),past);show(r.value,past,{kind:s.kind});});return;}
            var box=node('section',null,article);node('h4',s.kind==='musculacao'?((t.value&&t.value.exercise)||'Exercício')+' · série '+((t.value&&t.value.serie)||target):'Resultado',box);
            if(t.conflict)node('p','Conflito: há versões diferentes. Compare as revisões e escolha uma para corrigir.',box);
            if(t.value)show(t.value,box,{kind:s.kind});
            var details=node('details',null,box);node('summary','Original e revisões ('+t.revisions.length+')',details);
            t.revisions.forEach(function(r){var b=node('div',null,details);node('p',(r.parents.length?'Revisão':'Original')+' · '+(r.at===null?'horário não preservado no registro antigo':r.at)+(r.reason?' · '+r.reason:''),b);show(r.value,b,{kind:s.kind});if(t.conflict&&t.heads.indexOf(r.id)>=0)button('Usar esta versão e corrigir',b,function(){edit(s,target,r,box);});});
            if(!t.conflict)button('Corrigir resultado',box,function(){if(!box.querySelector('form'))edit(s,target,t.revisions.find(function(r){return r.id===t.heads[0];}),box);});
          });
          if(!Object.keys(s.targets).length)node('p','Sem resultados confirmados.',article);
        });
        // Legado somente leitura: valores reais, sem reconstrução de receita.
        var legacy=C.legacy?C.legacy(dateInput.value):[];
        legacy.forEach(function(r){
          var kind=r._kind, original=clone(r);delete original._kind;
          if(r.hid||sessions.some(function(s){return s.id===r.id||s.id===r.sid||s.legacy&&Object.values(s.targets).some(function(t){return t.original.some(function(o){return same(o.value,original);});});}))return;
          var a=node('article',null,results);node('h3','Registro anterior · '+(r.exercise||r.n||'Treino'),a);node('p','Prescrição histórica e revisões não registradas. Resultado original disponível:',a);show(original,a,{kind:kind});
          button('Corrigir este registro',a,async function(){
            try {
              check();var digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(core.canonical({kind:kind,value:original})));
              check();var id='legacy-'+Array.from(new Uint8Array(digest)).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
              if(!begin(kind,id,original.d,{},true))return;
              legacyResult(id,'result',original);
              // Importar um resultado existente não chama conclusão/check-in/XP.
              render();
            }catch(e){error(e);}
          });
        });
      }catch(e){node('p','Não foi possível ler o histórico. Os dados locais foram preservados.',results);error(e);}
    }
    function resume(kind,id) {
      try {check();var events=journal.read();if(!events['start:'+id])return true;var session=journal.session(id),t=session.targets.progress;if(!t||session.finished)return true;if(t.conflict)throw new Error('CONFLICT');if(raw(prefix+'liveAck:'+id,null)===t.heads[0])return true;
        if(!C.applyLive||C.applyLive(kind,id,clone(t.value))!==true)throw new Error('CHECKPOINT_PENDING');guarded.setItem(prefix+'liveAck:'+id,JSON.stringify(t.heads[0]));return true;
      }catch(e){return error(e);}
    }
    function live(kind,id,date,value) {
      try {check();var written=record(id,'progress',clone(value),null,'Progresso conferido no player');guarded.setItem(prefix+'liveAck:'+id,JSON.stringify(written[0]));if(C.navigate)C.navigate();dateInput.value=date;panel.open=true;render();panel.scrollIntoView({block:'start'});return true;}catch(e){return error(e);}
    }
    function mount(parent) {
      if(!parent)return;
      panel=node('details',null,parent);panel.id='thHistory';node('summary','Consultar e corrigir treino por data',panel);
      var lab=node('label','Data da sessão',panel);dateInput=node('input',null,lab);dateInput.type='date';dateInput.value=C.today();dateInput.onchange=render;
      var st=node('p',message,panel);st.id='thStatus';st.setAttribute('role','status');
      button('Habilitar edição',panel,acquire);if(sync)button('Sincronizar histórico',panel,function(){synchronize().then(render);});button('Atualizar consulta',panel,render);
      node('p','Correções preservam o original e não concluem outro treino. Registros antigos sem prescrição permanecem identificados.',panel);
      results=node('div',null,panel);panel.ontoggle=function(){if(panel.open)render();};
      var css=node('style',null,document.head);css.textContent='#thHistory{margin:16px 0;padding:16px;border:1px solid var(--borda,#777);border-radius:12px}#thHistory input{display:block;min-height:44px;font-size:16px;width:100%;box-sizing:border-box}#thHistory button{min-height:44px;margin:6px 6px 6px 0;padding:8px 12px;border:1px solid #777;border-radius:10px;background:var(--bg4);color:inherit;font:inherit;font-size:14px}#thHistory .th-session{padding:12px 0;border-bottom:1px solid #777}#thHistory .th-values{display:grid;grid-template-columns:minmax(90px,1fr) minmax(0,2fr);gap:6px;overflow-wrap:anywhere}#thHistory dd{margin:0}#thHistory p{margin:10px 0;line-height:1.45}#thHistory h3{margin:14px 0 8px}#thHistory h4{margin:12px 0 8px}#thHistory h5{margin:8px 0}#thHistory summary{min-height:30px;cursor:pointer}#thHistory .th-structured{grid-column:1/-1;padding:4px 0}#thHistory .th-structured details{padding:6px;border-left:2px solid #777}#thHistory .th-edit{padding:12px;border:1px solid #777}';
    }
    return {dispose:dispose,resume:localOperation(resume),live:localOperation(live),begin:localOperation(begin),beginMuscle:localOperation(beginMuscle),newMuscle:localOperation(newMuscle),belongs:belongs,volume:volume,muscleId:muscleId,muscle:localOperation(muscle),heads:heads,finish:localOperation(finish),finishMuscle:localOperation(finishMuscle),current:current,project:project,list:list,packet:packet,mount:mount,render:render,syncState:function(){return localFailure?'erro-local':syncState;},synchronize:synchronize,ready:function(){return lease&&C.active();},error:error};
  }
  root.MT_TREINO_HISTORICO_PLAYER={create:makePlayer};
})(typeof self!=='undefined'?self:this);
