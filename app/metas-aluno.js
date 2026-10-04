/* Apresentação e histórico das metas neste aparelho; não emite aprovação manual. */
(function(root){
  'use strict';
  function runtime(M,definitions,context,icons){
    if(!M)return null;
    var defs;try{defs=M.list(definitions);}catch(_){return null;}if(!defs.length)return null;
    var token=String(context.token||'local'),a=2166136261,b=5381;
    for(var i=0;i<token.length;i++){a=Math.imul(a^token.charCodeAt(i),16777619);b=Math.imul(b,33)^token.charCodeAt(i);}
    var key='ptmetasAudit:'+(a>>>0).toString(36)+(b>>>0).toString(36);
    function el(tag,text){var n=document.createElement(tag);if(text!=null)n.textContent=text;return n;}
    function paint(){
      if(!context.identity())return;
      var grid=document.getElementById('cqGrid');if(!grid)return;
      var box=document.getElementById('mpAluno');if(!box){box=el('section');box.id='mpAluno';box.className='me-next';grid.before(box);}
      box.replaceChildren(el('h3','Metas personalizadas'));
      box.appendChild(el('p','Conta novos registros após receber a meta, desde a data de início. Histórico somente neste aparelho: não sincroniza entre dispositivos e pode ser perdido ao limpar os dados. Não certifica provas nem recordes.'));
      var stored,previousRaw;
      try{previousRaw=localStorage.getItem(key);stored=previousRaw?JSON.parse(previousRaw):{};if(!stored||typeof stored!=='object'||Array.isArray(stored))throw Error('Histórico inválido');}catch(_){box.appendChild(el('p','Não foi possível ler o histórico de metas. Nenhuma nova conquista foi concedida.'));return;}
      var results;try{results=defs.map(function(d){return M.evaluate(d,context.snapshot(),stored[d.id],new Date().toISOString());});}catch(_){box.appendChild(el('p','Histórico de metas inválido. Nenhuma nova conquista foi concedida.'));return;}var next=JSON.parse(JSON.stringify(stored));
      results.forEach(function(r){next[r.def.id]=r.state;});
      var saved=true;try{var raw=JSON.stringify(next);if(raw!==previousRaw)localStorage.setItem(key,raw);}catch(_){saved=false;}
      if(!saved){var error=el('p','Não foi possível salvar o histórico. Nenhuma nova conquista foi confirmada. Tente novamente após liberar espaço.');error.setAttribute('role','status');box.appendChild(error);}
      var labels={agendada:'Começa na data indicada',andamento:'Em andamento',sem_dados:'Sem registros elegíveis',alcancada:'Meta alcançada',revisao:'Precisa de revisão',encerrada:'Meta encerrada'};
      results.forEach(function(r){
        var d=r.def,state=saved?r.state:stored[d.id],card=el('article');card.style.cssText='border-top:1px solid var(--bg11);padding:16px 0;overflow-wrap:anywhere';card.dataset.mpId=d.id;
        var icon=el('span');icon.setAttribute('aria-hidden','true');icon.innerHTML='<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">'+((icons||{})[d.icone]||'<circle cx="12" cy="12" r="8"/>')+'</svg>';card.appendChild(icon);
        card.appendChild(el('h4',d.nome));card.appendChild(el('p',d.alvo+' '+d.unidade+' · '+(d.exercicio||d.modalidade)+' · desde '+d.inicio));
        card.appendChild(el('strong',state?(state.status==='sem_dados'&&d.tipo==='carga'?'Dados insuficientes':labels[state.status]):'Aguardando gravação'));
        if(d.encerrada&&state&&state.award)card.appendChild(el('p','Meta encerrada; concessão anterior preservada no histórico.'));
        card.appendChild(el('p',r.registros?r.valor.toLocaleString('pt-BR',{maximumFractionDigits:2})+' '+d.unidade+' em registros elegíveis':(d.tipo==='carga'?'É necessário um novo registro concluído com o identificador deste exercício. Registros sem identificação não concedem a meta.':'Registre uma atividade concluída após o início da meta.')));
        var progress=el('progress');progress.max=100;progress.value=r.percentual;progress.setAttribute('aria-label','Progresso de '+d.nome);card.appendChild(progress);
        if(state&&state.history&&state.history.length){var details=el('details');details.appendChild(el('summary','Histórico neste aparelho'));state.history.forEach(function(h){details.appendChild(el('p',h.em+' · '+h.motivo));});card.appendChild(details);}
        box.appendChild(card);
      });
      return results;
    }
    var api={pinta:paint,chave:key};return api;
  }
  root.MT_METAS_ALUNO={runtime:runtime};
})(typeof self!=='undefined'?self:globalThis);
