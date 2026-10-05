/* Conquistas por aluno. Evidência comparável; nenhuma concessão manual no app do aluno. */
(function(root){
'use strict';
function runtime(){
  const groups=['corrida','musculacao','circuito','crossfit','hyrox'];
  const day=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
  const pos=n=>typeof n==='number'&&Number.isFinite(n)&&n>0;
  const text=(s,n)=>typeof s==='string'&&s.trim()&&s.length<=n;
  function protocol(w){
    if(!w||!text(w.id,160))return '';
    const p={id:w.id,t:w.t||w.tipo,cap:+w.cap||0,min:+w.min||10,rd:+w.rd||+w.rounds||8,wk:+w.wk||+w.work||20,rs:+w.rs||+w.rest||10,ms:Array.isArray(w.ms)?w.ms:(Array.isArray(w.movs)&&w.movs.length?w.movs:(Array.isArray(w.mov)?w.mov:[]).map(n=>({q:'',n:String(n)})))};
    if(p.ms.some(m=>!m||typeof m!=='object'))return '';
    p.ms=p.ms.slice(0,12).map(m=>({q:String(m.q||''),n:String(m.n||'')}));
    return ['fortime','amrap'].includes(p.t)&&p.ms.length&&p.ms.every(m=>m.n)?JSON.stringify(p):'';
  }
  function definition(d){
    if(!d||!/^ma_[\w-]{1,90}$/.test(d.id||'')||!text(d.nome,80)||!groups.includes(d.grupo)||!['tempo','recorde'].includes(d.tipo)||!day(d.inicio)||!day(d.criadaDia)||d.inicio<=d.criadaDia)throw Error('Confira nome, modalidade e data futura.');
    const o={id:d.id,nome:d.nome.trim(),grupo:d.grupo,tipo:d.tipo,inicio:d.inicio,criadaDia:d.criadaDia,encerrada:d.encerrada===true};
    if(d.grupo==='musculacao'){
      if(d.tipo!=='recorde'||!text(d.exercicioId,160)||!text(d.exercicio,160)||!Number.isInteger(d.reps)||d.reps<1||d.reps>1000)throw Error('Musculação: selecione exercício e repetições para comparar carga. Tempo por exercício indisponível.');
      Object.assign(o,{exercicioId:d.exercicioId,exercicio:d.exercicio,reps:d.reps,unidade:'kg',sentido:'maior'});
    }else if(d.grupo==='corrida'){
      if(!pos(d.distancia)||d.distancia>1000||Number(d.distancia.toFixed(2))!==d.distancia)throw Error('Informe a distância exata em km, com até duas casas decimais.');
      Object.assign(o,{distancia:d.distancia,baseTempo:'ativo',unidade:'s',sentido:'menor'});
    }else{
      let p;try{p=JSON.parse(d.protocolo);}catch(_){throw Error('Selecione um protocolo prescrito compatível.');}
      if(protocol(p)!==d.protocolo||!['','rx','esc','adp'].includes(d.execucao)||(d.grupo==='crossfit'&&!d.execucao))throw Error('Confira protocolo e modo de execução.');
      Object.assign(o,{protocolo:d.protocolo,protocoloNome:String(d.protocoloNome||'Protocolo').slice(0,100),execucao:d.execucao,unidade:d.tipo==='recorde'&&p.t==='amrap'?'voltas':'s',sentido:p.t==='fortime'?'menor':'maior'});
    }
    if(d.tipo==='tempo'){if(!pos(d.alvo)||!Number.isInteger(d.alvo)||d.alvo>604800)throw Error('Informe a meta em segundos inteiros.');o.alvo=d.alvo;}
    return o;
  }
  function list(ds){if(ds==null)return [];if(!Array.isArray(ds)||ds.length>40)throw Error('Máximo de 40 metas avançadas por aluno.');const ids=new Set();return ds.map(d=>{const x=definition(d);if(ids.has(x.id))throw Error('Meta duplicada.');ids.add(x.id);return x;});}
  function records(d,s){
    const all={},bad=new Set();
    function add(id,r,value,proof){if(!id||!day(r.d)||r.d>s.hoje||!pos(value))return;const x={id,d:r.d,value,fp:JSON.stringify([id,r.d,value,proof])};if(all[id]&&all[id].fp!==x.fp)bad.add(id);all[id]=x;}
    if(d.grupo==='corrida') (Array.isArray(s.cardio)?s.cardio:[]).forEach(r=>{if(r&&typeof r.id==='string'&&r.id&&r.m==='corrida'&&r.status==='completo'&&!r.parcial&&r.tempoBase==='ativo'&&r.k===d.distancia)add('cr:'+r.id,r,r.s,[r.m,r.k,r.tempoBase,r.status,r.parcial===true]);});
    else if(d.grupo==='musculacao') Object.values(s.cargas||{}).forEach(rows=>{if(Array.isArray(rows))rows.forEach(r=>{if(r&&r.exercicioId===d.exercicioId&&r.g===2&&r.feito===true&&r.r===d.reps&&text(r.i,100))add('kg:'+r.d+':'+r.i,r,r.kg,[r.exercicioId,r.r,r.g,r.feito]);});});
    else{
      const p=JSON.parse(d.protocolo),rows=(s.wodres||{})[p.id];
      if(Array.isArray(rows))rows.forEach(r=>{if(!r||!text(r.sid,160)||r.parcial!==false||r.nf!==0||r.tp!==p.t||(r.cf||'')!==d.execucao)return;let proof;try{proof=protocol(JSON.parse(r.prescricao));}catch(_){return;}if(proof!==d.protocolo)return;
        if(!Number.isInteger(r.v)||r.v<0)return;
        if(p.t==='amrap'&&r.du!==p.min*60)return;
        if(d.tipo==='recorde'&&p.t==='amrap'&&r.ex!==0)return; // Voltas com reps extras não são reduzidas a um número inventado.
        add('wod:'+p.id+':'+r.sid,r,p.t==='fortime'?r.v:d.tipo==='tempo'?r.du:r.v,[proof,r.tp,r.cf||'',r.nf,r.parcial,r.du,r.ex]);
      });
    }
    bad.forEach(id=>delete all[id]);return all;
  }
  function rawIds(d,s){
    if(d.grupo==='corrida')return (Array.isArray(s.cardio)?s.cardio:[]).filter(Boolean).map(r=>'cr:'+r.id);
    if(d.grupo==='musculacao')return Object.values(s.cargas||{}).flatMap(rs=>Array.isArray(rs)?rs.filter(Boolean).map(r=>'kg:'+r.d+':'+r.i):[]);
    return Object.entries(s.wodres||{}).flatMap(([id,rs])=>Array.isArray(rs)?rs.filter(Boolean).map(r=>'wod:'+id+':'+r.sid):[]);
  }
  function evaluate(def,s,prior,now){
    const d=definition(def);if(!day(s.hoje))throw Error('Data atual inválida.');const all=records(d,s),state=prior?JSON.parse(JSON.stringify(prior)):{baseline:rawIds(d,s),history:[{em:now,tipo:'inicio',motivo:'Recebida neste aparelho; registros já presentes não concedem a meta.'}]};
    if(!Array.isArray(state.baseline)||!Array.isArray(state.history)||state.history.length>200)throw Error('Histórico inválido.');
    // Encerrar não altera a prova da concessão anterior.
    const {nome,exercicio,protocoloNome,criadaDia,encerrada,...criterion}=d;const signature=JSON.stringify(criterion);
    if(state.award&&state.status!=='revisao'&&(state.signature!==signature||Object.entries(state.award.evidence).some(([id,fp])=>!all[id]||all[id].fp!==fp))){state.status='revisao';state.history.push({em:now,tipo:'revisao',motivo:'Critério ou evidência alterada/ausente. A concessão anterior foi preservada.'});}
    if(state.award&&state.status!=='revisao'&&d.tipo==='recorde'){const winner=all[state.award.recordId];const older=winner?Object.values(all).filter(r=>r.d<winner.d):[];if(!winner||!older.length||older.some(r=>d.sentido==='menor'?r.value<=winner.value:r.value>=winner.value)){state.status='revisao';state.history.push({em:now,tipo:'revisao',motivo:'Uma referência anterior impede confirmar este recorde.'});}}
    const candidates=Object.values(all).filter(r=>r.d>=d.inicio&&!state.baseline.includes(r.id)).sort((a,b)=>a.d.localeCompare(b.d)||a.id.localeCompare(b.id));
    let winner=null,reference=[];
    for(const r of candidates){
      if(d.tipo==='tempo'){if(d.sentido==='menor'?r.value<=d.alvo:r.value>=d.alvo){winner=r;break;}}
      else {const older=Object.values(all).filter(x=>x.d<r.d);if(!older.length)continue;const best=(d.sentido==='menor'?Math.min:Math.max)(...older.map(x=>x.value));if(d.sentido==='menor'?r.value<best:r.value>best){winner=r;reference=older;break;}}
    }
    if(!state.award&&winner&&!d.encerrada){const evidence={};[winner,...reference].forEach(r=>evidence[r.id]=r.fp);state.award={em:now,valor:winner.value,recordId:winner.id,evidence};state.status='alcancada';state.signature=signature;state.history.push({em:now,tipo:'alcancada',motivo:d.tipo==='recorde'?'Recorde comparável: melhora estrita sobre registros de dias anteriores.':'Meta de tempo alcançada com registro compatível.'});}
    if(!state.award){state.status=d.encerrada?'encerrada':s.hoje<d.inicio?'agendada':'sem_dados';state.signature=signature;}
    return {def:d,state,registros:candidates.length};
  }
  function manual(m){
    if(!m||!/^cm_[\w-]{1,90}$/.test(m.id||'')||!text(m.nome,80)||!groups.includes(m.grupo)||!text(m.motivo,500)||!text(m.autor,100)||!day(m.data)||!['ativa','revogada'].includes(m.status)||!Array.isArray(m.history)||!m.history.length)throw Error('Confira os dados da concessão manual.');
    return JSON.parse(JSON.stringify(m));
  }
  function grant(items,data,now){const next=(items||[]).map(manual);const m=manual({...data,status:'ativa',history:[{em:now,tipo:'concedida',motivo:data.motivo}]});if(next.length>=100)throw Error('Máximo de 100 concessões por aluno.');if(next.some(x=>x.id===m.id||(x.nome.trim().toLocaleLowerCase()===m.nome.trim().toLocaleLowerCase()&&x.grupo===m.grupo&&x.data===m.data)))throw Error('Esta concessão já foi registrada para o aluno nesta data.');next.push(m);return next;}
  function revoke(items,id,reason,now){if(!text(reason,500))throw Error('Informe o motivo da revogação.');const next=(items||[]).map(manual),m=next.find(x=>x.id===id);if(!m)throw Error('Concessão não encontrada.');if(m.status==='revogada')return next;m.status='revogada';m.history.push({em:now,tipo:'revogada',motivo:reason.trim()});return next;}
  return {groups,day,protocol,definition,list,records,evaluate,manual,grant,revoke};
}
function student(M,defs,manuals,C){
  let metas=[],concessoes=[],invalid=false;try{metas=M.list(defs);concessoes=(manuals||[]).map(M.manual);}catch(_){invalid=true;}if(!metas.length&&!concessoes.length&&!invalid)return null;
  let hashA=2166136261,hashB=5381;for(const c of String(C.token||'local')){hashA=Math.imul(hashA^c.charCodeAt(0),16777619);hashB=Math.imul(hashB,33)^c.charCodeAt(0);}
  const key='ptconquistasAvancadas:'+(hashA>>>0).toString(36)+(hashB>>>0).toString(36);
  const el=(tag,txt)=>{const n=document.createElement(tag);n.textContent=txt;return n;};
  function paint(){if(!C.identity())return;const grid=document.getElementById('cqGrid');if(!grid)return;let box=document.getElementById('maAluno');if(!box){box=el('section','');box.id='maAluno';box.className='me-next';grid.before(box);}box.replaceChildren(el('h3','Conquistas e recordes personalizados'),el('p','Concessões automáticas: auditoria somente neste aparelho, sem sincronização entre dispositivos; limpar os dados pode apagar o histórico. Protocolos personalizados não certificam provas oficiais.'));
    if(invalid){box.appendChild(el('p','Configuração de conquistas inválida. Nenhuma concessão foi confirmada.'));return;}
    let saved,results;try{saved=JSON.parse(localStorage.getItem(key)||'{}');if(!saved||typeof saved!=='object'||Array.isArray(saved))throw Error();results=metas.map(d=>M.evaluate(d,C.snapshot(),saved[d.id],new Date().toISOString()));const next={...saved};results.forEach(r=>next[r.def.id]=r.state);localStorage.setItem(key,JSON.stringify(next));}catch(_){box.appendChild(el('p','Não foi possível validar ou salvar a auditoria. Nenhuma nova conquista automática foi confirmada.'));results=[];}
    const labels={alcancada:'Alcançada automaticamente',revisao:'Precisa de revisão',agendada:'Agendada',encerrada:'Encerrada',sem_dados:'Dados insuficientes para conceder'};
    results.forEach(r=>{const a=el('article','');a.style.cssText='border-top:1px solid var(--bg11);padding:16px 0;overflow-wrap:anywhere';a.dataset.maId=r.def.id;a.append(el('h4',r.def.nome),el('p',r.def.grupo+' · '+r.def.tipo+' · '+(r.def.sentido==='menor'?'menor é melhor':'maior é melhor')+' · '+r.def.unidade),el('strong',labels[r.state.status]));a.append(el('p',r.def.grupo==='corrida'?'Distância exata: '+r.def.distancia+' km · tempo do cronômetro sem pausas, incluindo descansos das etapas':r.def.grupo==='musculacao'?r.def.exercicio+' · '+r.def.reps+' repetições':r.def.protocoloNome+' · '+({rx:r.def.grupo==='crossfit'?'RX informado':'como prescrito (informado)',esc:'escalado',adp:'adaptado'}[r.def.execucao]||'sem categoria oficial')));if(r.def.tipo==='tempo')a.append(el('p','Meta: '+(r.def.sentido==='menor'?'até ':'pelo menos ')+r.def.alvo+' s'));if(r.state.award)a.append(el('p','Valor concedido: '+r.state.award.valor+' '+r.def.unidade));if(r.def.tipo==='recorde')a.append(el('p','Exige registro comparável em um dia anterior. Primeiro resultado e empate não são recordes.'));const h=el('details','');h.append(el('summary','Histórico neste aparelho'));r.state.history.forEach(e=>h.append(el('p',e.em+' · '+e.motivo)));a.append(h);box.append(a);});
    concessoes.forEach(m=>{const a=el('article','');a.dataset.manualId=m.id;a.append(el('h4',m.nome),el('strong',m.status==='ativa'?'Concedida manualmente pelo personal':'Concessão manual revogada'),el('p',m.grupo+' · '+m.data+' · '+m.autor),el('p',m.motivo));m.history.forEach(h=>a.append(el('p',h.em+' · '+h.tipo+' · '+h.motivo)));box.append(a);});
  }
  return {pinta:paint,chave:key};
}
const api=runtime();api.runtime=runtime;api.student=student;root.MT_CONQUISTAS_AVANCADAS=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
