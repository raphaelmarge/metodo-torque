/* Metas prospectivas. Regras puras e auditoria local, sem XP ou validação manual. */
(function(root){
  'use strict';
  function runtime(){
    function day(v){return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T12:00:00Z'))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;}
    function positive(n){return typeof n==='number'&&Number.isFinite(n)&&n>0;}
    function definition(d){
      if(!d||!/^mp_[a-zA-Z0-9_-]{1,80}$/.test(d.id||'')||!['distancia','carga'].includes(d.tipo)||!day(d.inicio)||!day(d.criadaDia)||d.inicio<=d.criadaDia||!positive(d.alvo)||d.alvo>1000000)throw Error('Confira a meta e a data futura de início.');
      if(Number(d.alvo.toFixed(2))!==d.alvo)throw Error('Use até duas casas decimais no valor da meta.');
      if(typeof d.nome!=='string'||!d.nome.trim()||d.nome.length>80)throw Error('Dê um nome à meta (até 80 caracteres).');
      var out={id:d.id,nome:d.nome.trim(),tipo:d.tipo,alvo:d.alvo,inicio:d.inicio,criadaDia:d.criadaDia,encerrada:d.encerrada===true,icone:['halter','mapa','bandeira','alvo','montanha','bike','corrida'].includes(d.icone)?d.icone:'alvo'};
      if(d.tipo==='distancia'){if(!['corrida','bike','caminhada'].includes(d.modalidade))throw Error('Escolha a modalidade.');out.modalidade=d.modalidade;out.unidade='km';}
      else{if(typeof d.exercicio!=='string'||!d.exercicio.trim()||d.exercicio.length>160)throw Error('Escolha um exercício.');out.exercicio=d.exercicio;out.exercicioId=typeof d.exercicioId==='string'&&d.exercicioId.trim()&&d.exercicioId.length<=160?d.exercicioId:'';out.unidade='kg';}
      return out;
    }
    function list(ds){if(ds==null)return [];if(!Array.isArray(ds)||ds.length>40)throw Error('Máximo de 40 metas, incluindo encerradas.');var seen={};return ds.map(function(d){var x=definition(d);if(seen[x.id])throw Error('Meta duplicada.');seen[x.id]=1;return x;});}
    function loads(s){return Object.keys(s.cargas||{}).reduce(function(a,k){var rows=s.cargas[k];return Array.isArray(rows)?a.concat(rows):a;},[]);}
    function records(d,s){
      var out=Object.create(null),bad=new Set(),raw=d.tipo==='distancia'?(Array.isArray(s.cardio)?s.cardio:[]):loads(s);
      if(!Array.isArray(raw))raw=[];
      raw.forEach(function(r){
        if(!r||!day(r.d)||r.d<d.inicio||r.d>s.hoje)return;
        var id,value,fingerprint;
        if(d.tipo==='distancia'){
          if(typeof r.id!=='string'||!r.id||r.m!==d.modalidade||r.status!=='completo'||r.parcial||!positive(r.k)||r.k>1000000||Number(r.k.toFixed(2))!==r.k||!positive(r.s))return;
          id='cardio:'+r.id;value=r.k;fingerprint=JSON.stringify([r.d,r.m,r.k,r.s,r.status]);
        }else{
          if(!d.exercicioId||r.exercicioId!==d.exercicioId||r.g!==2||r.feito!==true||typeof r.i!=='string'||!r.i||!positive(r.kg))return;
          id='carga:'+r.d+':'+r.i;value=r.kg;fingerprint=JSON.stringify([r.d,r.i,r.kg,r.serie,r.feito,r.exercicioId]);
        }
        if(out[id]&&out[id].fingerprint!==fingerprint)bad.add(id);
        out[id]={value:value,fingerprint:fingerprint};
      });bad.forEach(function(id){delete out[id];});return out;
    }
    function evaluate(def,s,previous,now){
      var d=definition(def);if(!day(s.hoje))throw Error('Data atual inválida.');
      var state=previous?JSON.parse(JSON.stringify(previous)):{history:[]};if(!state||typeof state!=='object'||!Array.isArray(state.history)||state.history.length>100||(state.award&&(!state.award.evidence||typeof state.award.evidence!=='object'||Array.isArray(state.award.evidence))))throw Error('Histórico de metas inválido.');
      var signature=JSON.stringify([d.tipo,d.alvo,d.inicio,d.tipo==='carga'?d.exercicioId:d.modalidade]),evidence=records(d,s);
      if(!previous){var original=d.tipo==='distancia'?(Array.isArray(s.cardio)?s.cardio:[]):loads(s);state.baselineIds=Array.from(new Set((Array.isArray(original)?original:[]).filter(function(r){return r&&(d.tipo==='distancia'?typeof r.id==='string'&&r.id:typeof r.i==='string'&&r.i&&typeof r.d==='string');}).map(function(r){return d.tipo==='distancia'?'cardio:'+r.id:'carga:'+r.d+':'+r.i;})));state.history.push({tipo:'inicio',em:now,motivo:'Meta recebida neste aparelho; registros já presentes não concedem esta conquista.'});}
      if(!Array.isArray(state.baselineIds))throw Error('Referência inicial da meta inválida.');
      state.baselineIds.forEach(function(id){delete evidence[id];});
      var keys=Object.keys(evidence).sort(),value=d.tipo==='distancia'?keys.reduce(function(n,k){return n+Math.round(evidence[k].value*100);},0)/100:keys.reduce(function(n,k){return Math.max(n,evidence[k].value);},0);
      function event(type,reason){state.history.push({tipo:type,em:now,motivo:reason});}
      if(state.award&&state.status!=='revisao'){
        var changed=state.signature!==signature||Object.keys(state.award.evidence).some(function(id){return !evidence[id]||evidence[id].fingerprint!==state.award.evidence[id];});
        if(changed){state.status='revisao';event('revisao','A definição ou um registro usado na conquista mudou ou não está mais disponível.');}
      }
      if(!state.award&&!d.encerrada&&s.hoje>=d.inicio&&keys.length&&value>=d.alvo){
        var used={};if(d.tipo==='carga'){var key=keys.find(function(k){return evidence[k].value>=d.alvo;});used[key]=evidence[key].fingerprint;}else{var total=0;keys.forEach(function(k){if(total<Math.round(d.alvo*100)){used[k]=evidence[k].fingerprint;total+=Math.round(evidence[k].value*100);}});}
        state.award={em:now,valor:value,evidence:used};state.status='alcancada';state.signature=signature;event('alcancada','Meta alcançada com registros concluídos desde '+d.inicio+'.');
      }
      if(!state.award){state.status=d.encerrada?'encerrada':s.hoje<d.inicio?'agendada':keys.length?'andamento':'sem_dados';state.signature=signature;}
      return {state:state,valor:value,registros:keys.length,percentual:Math.min(100,Math.floor(value/d.alvo*100)),def:d};
    }
    return {definition:definition,list:list,evaluate:evaluate,day:day};
  }
  var api=runtime();api.runtime=runtime;root.MT_METAS_PESSOAIS=api;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
