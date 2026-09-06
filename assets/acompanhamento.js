/* Regras de acompanhamento compartilháveis e testáveis, sem rede ou dados globais. */
(function (root) {
  'use strict';
  function iso(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
  function semana(hoje) { var d = new Date(hoje+'T12:00:00'); d.setDate(d.getDate()-(d.getDay()+6)%7); return iso(d); }
  function lista(v) { return Array.isArray(v) ? v : []; }
  function resumo(st, a, hoje) {
    var ini=semana(hoje), ret=a.retorno||a.demoRetorno||{}, t=(st.treinosV2||{})[a.id]||{}, dias=[], feitos={};
    for(var i=0;i<7;i++){var d=new Date(ini+'T12:00:00');d.setDate(d.getDate()+i);var k=iso(d),p=((t.plano||{}).dias||{})[d.getDay()];dias.push({d:k,planejado:lista(p).length>0||!!(p&&p.tp),feito:false});}
    Object.keys(ret.feitos||{}).forEach(function(k){if(ret.feitos[k]&&k>=ini&&k<=hoje)feitos[k]=true;});
    lista(st.sessoes).forEach(function(s){if(s.alunoId===a.id&&s.feita&&s.data>=ini&&s.data<=hoje)feitos[s.data]=true;});
    dias.forEach(function(d){d.feito=!!feitos[d.d];});
    var rs=Object.keys(ret.rpe||{}).filter(function(k){return k>=ini&&k<=hoje&&[1,2,3].indexOf(+ret.rpe[k])>=0;}).map(function(k){return +ret.rpe[k];});
    var notas=lista(ret.notas).filter(function(n){return n&&n.d>=ini&&n.d<=hoje;});
    var av=[];Object.keys(ret.cargas||{}).forEach(function(ex){var l=lista(ret.cargas[ex]).filter(function(x){return x&&x.d<=hoje&&+x.kg>0&&(x.g!==2||x.feito===true);}).slice().sort(function(a,b){return a.d.localeCompare(b.d);});var antes=l.filter(function(x){return x.d<ini;});var atual=l.filter(function(x){return x.d>=ini;});if(!antes.length||!atual.length)return;var de=Math.max.apply(null,antes.map(function(x){return +x.kg;})),para=Math.max.apply(null,atual.map(function(x){return +x.kg;}));if(para>de)av.push({ex:ex,de:de,para:para});});
    return {inicio:ini,dias:dias,planejados:dias.filter(function(d){return d.planejado;}).length,realizados:Object.keys(feitos).length,meta:Math.max(1,+a.metaSemana||3),rpe:rs.length?Math.round(rs.reduce(function(s,v){return s+v;},0)/rs.length*10)/10:null,notas:notas,avancos:av,atualizado:ret.atualizado||'',checks:lista(ret.checks).filter(function(c){return c&&c.d>=ini&&c.d<=hoje;})};
  }
  function texto(st,a,hoje){var r=resumo(st,a,hoje);return a.nome+' — semana de '+r.inicio+'\n'+r.realizados+' dias com treino registrado. Meta: '+r.meta+' dias.\n'+(r.planejados?r.planejados+' dias planejados na semana.':'Semana ainda sem programação.')+'\n'+(r.rpe!==null?'Esforço médio registrado: '+r.rpe+' de 3 (1 leve, 2 na medida, 3 pesado).':'Sem esforço registrado nesta semana.')+'\n'+(r.avancos.length?r.avancos.map(function(x){return x.ex+': '+x.de+' → '+x.para+' kg.';}).join('\n'):'Sem novo máximo de carga registrado nesta semana.')+'\n'+(r.notas.length?'Relatos do aluno:\n'+r.notas.map(function(n){return n.d+': '+n.t;}).join('\n'):'Sem relatos nesta semana.')+'\n\nOrientação do personal: ';}
  function individuais(it){return lista(it&&it.seriesDetalhadas).length>0;}
  function snapshot(st,id){var t=(st.treinosV2||{})[id]||{};return JSON.parse(JSON.stringify({validade:t.validade||'',plano:t.plano||{},wods:t.wods||[],cardio:t.cardio||[],fichas:lista(t.fichas).map(function(f){return {id:f.id,titulo:f.titulo,p2:f.p2||null,itens:lista(f.itens).map(function(it){var ex=lista(st.exercicios).find(function(e){return e.id===it.exId;})||{};return {nome:ex.nome||'Exercício removido',series:individuais(it)?it.seriesDetalhadas.length:it.series,reps:it.reps,carga:it.carga,descanso:it.descanso,seriesDetalhadas:it.seriesDetalhadas,obs:it.obs||'',tec:it.tec||'',video:it.video||'',alternativas:it.alternativas};})}})}));}
  function diferencas(antes,agora){if(!antes)return ['Primeira comparação: a referência será guardada após publicar com sucesso.'];var out=[];['validade','plano','wods','cardio'].forEach(function(k){if(JSON.stringify(antes[k])!==JSON.stringify(agora[k]))out.push(({validade:'Validade',plano:'Semana do aluno',wods:'Circuitos',cardio:'Corrida e bike'})[k]+' alterada.');});lista(agora.fichas).forEach(function(f){var old=lista(antes.fichas).find(function(x){return x.id===f.id;});if(!old){out.push('Nova ficha: '+f.titulo);return;}if(old.titulo!==f.titulo)out.push('Nome da ficha: '+old.titulo+' → '+f.titulo);var n=Math.max(lista(old.itens).length,lista(f.itens).length);for(var i=0;i<n;i++){var a=lista(old.itens)[i],b=lista(f.itens)[i];if(JSON.stringify(a)!==JSON.stringify(b))out.push(f.titulo+' · posição '+(i+1)+': '+(a?itemTexto(a):'vazia')+' → '+(b?itemTexto(b):'removido'));}if(JSON.stringify(old.p2)!==JSON.stringify(f.p2))out.push(f.titulo+': parte 2 alterada.');});lista(antes.fichas).forEach(function(f){if(!lista(agora.fichas).some(function(x){return x.id===f.id;}))out.push('Ficha removida: '+f.titulo);});return out.length?out:['Nenhuma alteração na prescrição desde a última publicação registrada.'];}
  function cargaTexto(v){if(v==null||String(v).trim()==='')return '';var n=Number(String(v).replace(',','.'));return isFinite(n)&&n>=0?', '+String(n).replace('.',',')+' kg':'';}
  function linhaSerie(x,linha){linha=linha||{};return {reps:linha.reps==null||String(linha.reps).trim()===''?x.reps:linha.reps,carga:linha.carga===undefined?x.carga:linha.carga,descanso:linha.descanso==null?(x.descanso==null?60:x.descanso):linha.descanso};}
  function itemTexto(x){var prescricao=individuais(x)?x.seriesDetalhadas.map(function(l,i){var s=linhaSerie(x,l);return (i+1)+'ª série: '+(s.reps==null?'—':s.reps)+(/^[0-9\s,./–-]+$/.test(String(s.reps))?' reps':'')+cargaTexto(s.carga)+', '+s.descanso+'s';}).join('; '):x.series+' × '+x.reps+cargaTexto(x.carga)+' · '+(x.descanso==null?60:x.descanso)+'s';return x.nome+' · '+prescricao+(x.obs?' · '+x.obs:'')+(x.tec?' · '+x.tec:'')+(x.video?' · vídeo '+x.video:'')+(Array.isArray(x.alternativas)?' · alternativas: '+(x.alternativas.join(', ')||'nenhuma'):'');}
  function selecionados(f,indices){var vistos={};return lista(indices).filter(function(i){if(!/^\d+$/.test(String(i))||vistos[+i]||!lista(f&&f.itens)[+i])return false;vistos[+i]=true;return true;}).map(function(i){return f.itens[+i];});}
  function loteSelecao(f,indices){var itens=selecionados(f,indices),qtd=itens.filter(individuais).length;return {total:itens.length,elegiveis:itens.length-qtd,individuais:qtd};}
  function lote(f,indices,campos){
    var itens=selecionados(f,indices);if(!itens.length)return false;campos=campos||{};
    var s=String(campos.series==null?'':campos.series).trim(),d=String(campos.descanso==null?'':campos.descanso).trim(),r=String(campos.reps==null?'':campos.reps).trim();
    if(s&&(!/^\d+$/.test(s)||+s<1||+s>30))throw Error('Use de 1 a 30 séries.');
    if(d&&(!/^\d+$/.test(d)||+d>1800))throw Error('Use descanso de 0 a 1800 segundos.');
    if(r.length>40)throw Error('Repetições: use até 40 caracteres.');
    if(!s&&!d&&!r)return false;
    var uniformizar=campos.uniformizar===true,alvos=uniformizar?itens:itens.filter(function(it){return !individuais(it);});
    if(!alvos.length)throw Error('Os exercícios selecionados têm séries individuais. Edite cada exercício para preservar a prescrição de cada série.');
    alvos.forEach(function(it){
      if(uniformizar&&individuais(it)){var primeira=linhaSerie(it,it.seriesDetalhadas[0]);it.series=it.seriesDetalhadas.length;it.reps=primeira.reps;it.descanso=primeira.descanso;it.carga=primeira.carga;delete it.seriesDetalhadas;}
      if(s)it.series=+s;if(d)it.descanso=+d;if(r)it.reps=r;
    });return true;
  }
  root.MT_ACOMP={resumo:resumo,texto:texto,snapshot:snapshot,diferencas:diferencas,lote:lote,loteSelecao:loteSelecao,itemTexto:itemTexto};
  if(typeof module!=='undefined')module.exports=root.MT_ACOMP;
})(typeof self!=='undefined'?self:globalThis);
