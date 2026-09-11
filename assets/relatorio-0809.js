/* Relatório 08/09: regras compartilhadas e interfaces conectadas explicitamente
 * ao Personal. Nenhum monkey-patch, timer ou acesso a dados de outro aluno.
 * Publicar continua sendo uma ação separada de salvar o rascunho. */
(function (root) {
  "use strict";
  function copy(x) { return JSON.parse(JSON.stringify(x)); }
  function norm(x) { return String(x == null ? "" : x).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function esc(x) { return String(x == null ? "" : x).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function atendimento(a) { return String(a && (a.atendimento || a.modalidade) || ""); }
  function online(a) { var m = norm(atendimento(a)); return ["online", "on-line", "consultoria online", "consultoria on-line"].indexOf(m) >= 0; }
  function pacotePrePago(st, a) {
    return !!(a && a.pacote && +a.pacote.total > (+a.pacote.usadas || 0) &&
      !(st.contratosPT || []).some(function (c) { return c.alunoId === a.id && c.status === "ativo"; }));
  }
  function dataOk(s) { var d = new Date(String(s) + "T12:00:00Z"); return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(d.getTime()) && d.toISOString().slice(0,10) === s; }
  function horaOk(s) { return !s || /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function lista(v) { return Array.isArray(v) ? v.filter(Boolean) : v && typeof v === "object" ? [v] : []; }
  function dia(plano, iso, dw) {
    plano = plano || {};
    if (plano.datas && dataOk(iso) && Object.prototype.hasOwnProperty.call(plano.datas, iso)) return lista(plano.datas[iso]);
    return lista((plano.dias || {})[String(dw)]);
  }
  function opcoes(t) {
    var o = []; t = t || {};
    [["ficha", t.fichas || []], ["wod", (t.wods || []).slice(0,10)], ["cardio", (t.cardio || []).slice(0,10)]].forEach(function (par) {
      par[1].forEach(function (x, i) { o.push({tp:par[0], id:x.id, i:i, n:String(x.titulo || x.nome || "Treino").slice(0,60)}); });
    }); return o;
  }
  function pacoteDatas(t) {
    var out = {}, opts = opcoes(t), ds = t && t.plano && t.plano.datas || {};
    Object.keys(ds).filter(dataOk).sort().forEach(function (d) {
      out[d] = lista(ds[d]).map(function (p) {
        var o = opts.find(function (x) { return x.tp === p.tp && x.id === p.id; });
        return o ? {tp:o.tp, i:o.i, n:o.n, h:horaOk(p.h || "") ? (p.h || "") : ""} : null;
      }).filter(Boolean).sort(function(a,b){return (a.h || "99:99").localeCompare(b.h || "99:99");});
    }); return Object.keys(out).length ? out : null;
  }
  function numero(x, min, max) {
    var s = String(x == null ? "" : x).trim().replace(",", "."), n = Number(s);
    if (!s || !isFinite(n) || n < min || n > max) throw new Error("Confira os limites numéricos informados.");
    return n;
  }
  function pace(x) { var s = String(x || "").trim(); if (!/^\d{1,2}:[0-5]\d$/.test(s)) throw new Error("Use pace no formato minutos:segundos."); var p = s.split(":"); return numero(+p[0]*60 + +p[1], 1, 5999); }
  function zona(x) {
    x = x || {}; var tipo = x.tipo, nome = String(x.nome || "").trim();
    if (!nome || nome.length > 60) throw new Error("Dê à zona um nome de até 60 caracteres.");
    if (["pace", "velocidade", "fc"].indexOf(tipo) < 0) throw new Error("Escolha pace, velocidade ou frequência cardíaca.");
    var min = tipo === "pace" ? pace(x.min) : numero(x.min, .01, tipo === "fc" ? 300 : 200);
    var max = tipo === "pace" ? pace(x.max) : numero(x.max, .01, tipo === "fc" ? 300 : 200);
    if (min > max) throw new Error("O primeiro limite deve ser menor ou igual ao segundo.");
    if (tipo === "fc" && (!Number.isInteger(min) || !Number.isInteger(max))) throw new Error("Use batimentos inteiros.");
    return {id:String(x.id || ""), nome:nome, tipo:tipo, min:min, max:max};
  }
  function zonaValida(z) {
    return !!(z && typeof z.nome === "string" && z.nome.length <= 60 && ["pace","velocidade","fc"].indexOf(z.tipo)>=0 &&
      Number.isFinite(z.min) && Number.isFinite(z.max) && z.min > 0 && z.min <= z.max && z.max <= (z.tipo === "pace" ? 5999 : z.tipo === "fc" ? 300 : 200));
  }
  function zNum(n,t) { return t === "pace" ? Math.floor(n/60) + ":" + String(n%60).padStart(2,"0") : String(n).replace(".",","); }
  function zonaTxt(z) { return zonaValida(z) ? z.nome + " · " + zNum(z.min,z.tipo) + "–" + zNum(z.max,z.tipo) + " " + ({pace:"min/km",velocidade:"km/h",fc:"bpm"}[z.tipo]) : ""; }
  function esforco(x) {
    if (!x || ["pace","velocidade","fc","rpe"].indexOf(x.tipo)<0) throw new Error("Escolha um alvo de ritmo, velocidade, frequência cardíaca ou percepção de esforço.");
    var teto={pace:5999,velocidade:200,fc:300,rpe:10}[x.tipo],piso=x.tipo==="rpe"?1:.01;
    if (!Number.isFinite(x.min) || !Number.isFinite(x.max) || x.min<piso || x.max>teto || x.min>x.max) throw new Error("Confira os limites do esforço da etapa.");
    if ((x.tipo==="pace"||x.tipo==="fc") && (!Number.isInteger(x.min)||!Number.isInteger(x.max))) throw new Error("Use valores inteiros para segundos de ritmo e batimentos.");
    return {tipo:x.tipo,min:x.min,max:x.max};
  }
  function esforcoTxt(x) { var nomes={pace:"Ritmo",velocidade:"Velocidade",fc:"FC",rpe:"Esforço"},unidades={pace:"min/km",velocidade:"km/h",fc:"bpm",rpe:"/10"};return nomes[x.tipo]+" "+zNum(x.min,x.tipo)+(x.max!==x.min?"–"+zNum(x.max,x.tipo):"")+(x.tipo==="rpe"?"":" ")+unidades[x.tipo]; }
  function acaoTxt(a) { var nomes={correr:"Correr",caminhar:"Caminhar",pedalar:"Pedalar",aquecer:"Aquecer",recuperar:"Recuperar"};return typeof a.acao==="string"&&Object.prototype.hasOwnProperty.call(nomes,a.acao)?nomes[a.acao]:""; }
  function alvo(x) {
    if (!x || ["km","m","min","s"].indexOf(x.unidade)<0) throw new Error("Escolha a unidade do bloco.");
    var v = numero(x.valor, .01, x.unidade === "km" ? 500 : x.unidade === "m" ? 500000 : x.unidade === "min" ? 1440 : 86400);
    if (x.zona && !zonaValida(x.zona)) throw new Error("A zona do bloco não é válida. Selecione-a novamente.");
    var a={valor:v, unidade:x.unidade, zona:x.zona ? copy(x.zona) : null};
    if (x.acao != null && x.acao !== "") { if(!acaoTxt(x))throw new Error("Escolha a ação da etapa.");a.acao=x.acao; }
    if (x.esforco != null) { if(x.zona)throw new Error("Escolha uma zona salva ou um esforço direto para a etapa.");a.esforco=esforco(x.esforco); }
    if (x.orientacao != null && x.orientacao !== "") { if(typeof x.orientacao!=="string"||x.orientacao.trim().length>240)throw new Error("Use uma orientação de até 240 caracteres por etapa.");var obs=x.orientacao.trim();if(obs)a.orientacao=obs; }
    return a;
  }
  function bloco(x) {
    if (!x || ["aquecimento","ativo","repetir","recuperacao"].indexOf(x.tipo)<0) throw new Error("Escolha o tipo de bloco.");
    var b = {tipo:x.tipo, alvo:alvo(x.alvo), repeticoes:1};
    if (b.tipo === "repetir") { b.repeticoes = numero(x.repeticoes,1,20); if(!Number.isInteger(b.repeticoes))throw new Error("Use um número inteiro de repetições."); b.recuperacao = alvo(x.recuperacao); }
    return b;
  }
  function blocos(bs) {
    if(!Array.isArray(bs) || bs.length>20)throw new Error("Use até 20 blocos.");
    var r=bs.map(bloco), n=0; r.forEach(function(b){n+=b.tipo==="repetir"?2*b.repeticoes:1;});
    if(n>60)throw new Error("A estrutura permite até 60 etapas, contando as repetições.");
    return r;
  }
  function alvoTxt(a) { return String(a.valor).replace(".",",")+" "+a.unidade+(a.zona?" · "+zonaTxt(a.zona):"")+(a.esforco?" · "+esforcoTxt(a.esforco):"")+(a.orientacao?" · "+a.orientacao:""); }
  function blocoTxt(b) { var nomes={aquecimento:"Aquecimento",ativo:"Ativo",repetir:"Repetir",recuperacao:"Recuperação"},repetir=b.tipo==="repetir";return (repetir?nomes[b.tipo]:acaoTxt(b.alvo)||nomes[b.tipo])+(repetir?" "+b.repeticoes+"×":"")+": "+(repetir&&acaoTxt(b.alvo)?acaoTxt(b.alvo)+" ":"")+alvoTxt(b.alvo)+(b.recuperacao?" / "+(acaoTxt(b.recuperacao)?acaoTxt(b.recuperacao)+" ":"")+alvoTxt(b.recuperacao):""); }
  function expande(bs) {
    var out=[];
    function add(a,k,n){var distancia=a.unidade==="km"||a.unidade==="m",ordem=n.match(/ \d+ de \d+$/);out.push({k:k,n:acaoTxt(a)?acaoTxt(a)+(ordem?ordem[0]:""):n,d:alvoTxt(a),s:distancia?0:a.valor*(a.unidade==="min"?60:1),km:distancia?a.valor/(a.unidade==="m"?1000:1):0});}
    blocos(bs).forEach(function(b){if(b.tipo==="repetir"){for(var i=0;i<b.repeticoes;i++){add(b.alvo,"f","Ativo "+(i+1)+" de "+b.repeticoes);add(b.recuperacao,"l","Recuperação "+(i+1)+" de "+b.repeticoes);}}else add(b.alvo,b.tipo==="aquecimento"?"aq":b.tipo==="recuperacao"?"vc":"c",{aquecimento:"Aquecimento",ativo:"Ativo",recuperacao:"Recuperação"}[b.tipo]);});return out;
  }
  var api={atendimento:atendimento,online:online,pacotePrePago:pacotePrePago,dataOk:dataOk,horaOk:horaOk,dia:dia,opcoes:opcoes,pacoteDatas:pacoteDatas,zona:zona,zonaTxt:zonaTxt,blocos:blocos,blocoTxt:blocoTxt,expande:expande};
  // A descrição é uma anotação. Legados preservam a natureza anterior à edição.
  function recebimentoTipo(p) { return p && (p.tipoRecebimento === "aulas" || p.tipoRecebimento === "servico") ? p.tipoRecebimento : p && p.desc ? "servico" : "aulas"; }
  function recebimentoAtivo(p) { return !!p && !p.anulacao; }
  function recebimentosAtivos(st) { return (st.pagamentos || []).filter(recebimentoAtivo); }
  function recebimentoDuplicados(st, p) {
    if (!recebimentoAtivo(p) || p.eventoId) return [];
    return recebimentosAtivos(st).filter(function(x) {
      return x.id !== p.id && x.alunoId === p.alunoId &&
        String(x.data || "").slice(0,10) === String(p.data || "").slice(0,10) &&
        (x.mes || String(x.data || "").slice(0,7)) === (p.mes || String(p.data || "").slice(0,7)) &&
        Math.round(+x.valor*100) === Math.round(+p.valor*100) && recebimentoTipo(x) === recebimentoTipo(p);
    });
  }
  function alteraRecebimento(st, pid, original, campos, meta) {
    var i=(st.pagamentos||[]).findIndex(function(p){return p.id===pid;});
    if(i<0 || JSON.stringify(st.pagamentos[i])!==original)throw new Error("Este recebimento mudou em outra sessão. Seu rascunho não foi salvo; feche e confira a versão atual.");
    var antes=st.pagamentos[i];
    if(!recebimentoAtivo(antes))throw new Error("Este recebimento já foi anulado. Consulte o histórico.");
    var next=Object.assign({},antes,{tipoRecebimento:recebimentoTipo(antes)});
    if(meta.acao==="anular") {
      var motivo=String(campos.motivo||"").trim();
      if(!motivo || motivo.length>200)throw new Error("Informe um motivo para a anulação, com até 200 caracteres.");
      next.anulacao={em:meta.em,por:meta.por,motivo:motivo};
    } else {
      var data=String(campos.data||""),mes=String(campos.mes||"");
      if(!dataOk(data)||(mes&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)))throw new Error("Confira a data e a competência.");
      next.data=data;next.valor=Math.round(numero(campos.valor,.01,1e12)*100)/100;
      next.forma=String(campos.forma||"").trim().slice(0,80);next.desc=String(campos.desc||"").trim().slice(0,200);
      if(mes)next.mes=mes;else delete next.mes;
    }
    st.pagamentosAuditoria=Array.isArray(st.pagamentosAuditoria)?st.pagamentosAuditoria:[];
    st.pagamentosAuditoria.push({id:meta.id,pagamentoId:pid,alunoId:antes.alunoId,acao:meta.acao,em:meta.em,por:meta.por,antes:copy(antes),depois:copy(next)});
    st.pagamentos[i]=next;st.recebimentosRevisao=(+st.recebimentosRevisao||0)+1;
    return next;
  }
  Object.assign(api,{recebimentoTipo:recebimentoTipo,recebimentoAtivo:recebimentoAtivo,recebimentosAtivos:recebimentosAtivos,recebimentoDuplicados:recebimentoDuplicados,alteraRecebimento:alteraRecebimento});
  root.MT_RELATORIO_0809=api;
  if(typeof module!=="undefined"&&module.exports)module.exports=api;
  if(typeof document==="undefined")return;

  var ctx=null;
  function $(id){return document.getElementById(id);}
  function uid(){return root.MTStore.uid();}
  function al(st,id){return(st.alunos||[]).find(function(a){return a.id===id;});}
  function tDe(st,id){return(st.treinosV2||{})[id]||{};}
  function grava(st,id,treino){(treino ? ctx.treinoMarca : ctx.marca)(st,id);if(ctx.save(st)===false)throw new Error("Não foi possível salvar. Seu rascunho foi mantido; confira o aviso de sincronização.");}
  function msg(id,e){$(id).textContent=e.message||String(e);}
  function options(opts){return opts.map(function(o){return '<option value="'+esc(o.id)+'">'+esc(o.nome)+'</option>';}).join("");}
  function dialog(html){var d=document.createElement("dialog");d.className="r809-dialog";d.innerHTML=html;document.body.appendChild(d);d.addEventListener("close",function(){d.remove();});d.showModal();return d;}
  function pagamentoHistorico(st,p) {
    var hist=(st.pagamentosAuditoria||[]).filter(function(x){return x.pagamentoId===p.id;});
    function resumo(x){if(!x)return "—";return (x.anulacao?"Anulado · ":"")+String(x.data||"")+" · R$ "+Number(x.valor||0).toFixed(2).replace(".",",")+" · "+String(x.forma||"")+(x.mes?" · competência "+x.mes:"")+(x.desc?" · "+x.desc:"");}
    return '<details><summary>Histórico de alterações · '+hist.length+'</summary>'+ (hist.length?hist.slice().reverse().map(function(x){return '<p><b>'+esc(x.acao==="anular"?"Anulação":"Edição")+'</b> · '+esc(new Date(x.em).toLocaleString("pt-BR"))+'<br>Antes: '+esc(resumo(x.antes))+'<br>Depois: '+esc(resumo(x.depois))+(x.depois&&x.depois.anulacao?'<br>Motivo: '+esc(x.depois.anulacao.motivo):'')+'</p>';}).join(''):'<p>Nenhuma alteração registrada.</p>')+'</details>';
  }
  function pagamento(pid){
    if(!ctx.financeiro())return;
    var st=ctx.load(),p=(st.pagamentos||[]).find(function(x){return x.id===pid;});if(!p)return;
    var original=JSON.stringify(p),conta=ctx.conta(),id=p.alunoId,anulado=!recebimentoAtivo(p);
    var d=dialog('<form><h2>'+(anulado?'Recebimento anulado':'Editar recebimento')+'</h2><p>Corrija o registro financeiro. Cobranças no banco ou no cartão e quantidades de aulas permanecem como estão.</p>'+
      (anulado?'<p><b>Anulado em '+esc(new Date(p.anulacao.em).toLocaleString("pt-BR"))+'</b><br>'+esc(p.anulacao.motivo)+'</p>':'')+
      '<fieldset'+(anulado?' disabled':'')+'><label>Data<input name="data" type="date" required value="'+esc(p.data)+'"></label><label>Valor (R$)<input name="valor" type="number" min="0.01" step="0.01" required value="'+esc(p.valor)+'"></label><label>Competência (opcional)<input name="mes" type="month" value="'+esc(p.mes||"")+'"></label><label>Forma<input name="forma" maxlength="80" value="'+esc(p.forma||"")+'"></label><label>Descrição / anotação<input name="desc" maxlength="200" value="'+esc(p.desc||"")+'"></label></fieldset>'+
      pagamentoHistorico(st,p)+'<p role="status" aria-live="polite"></p><div class="r809-actions"><button type="button" data-cancel>Fechar</button>'+(anulado?'':'<button type="submit">Salvar alteração</button>')+'</div>'+
      (anulado?'':'<details><summary>Anular recebimento</summary><p>O lançamento sai dos totais e da quitação, mas continua no histórico. Nenhum reembolso será enviado.</p><label>Motivo<input name="motivo" maxlength="200" placeholder="Ex.: lançamento duplicado"></label><button type="button" data-anular>Anular recebimento</button></details>')+'</form>');
    d.querySelector('[data-cancel]').onclick=function(){d.close();};
    function envia(acao){var status=d.querySelector('[role=status]');try{
      if(!ctx.financeiro()||ctx.conta()!==conta)throw new Error("A conta ou permissão mudou. Feche e reabra o recebimento.");
      var s=ctx.load(),form=d.querySelector('form'),fd=new FormData(form),campos={};
      fd.forEach(function(v,k){campos[k]=v;});
      var next=alteraRecebimento(s,pid,original,campos,{id:uid(),acao:acao,em:new Date().toISOString(),por:conta});
      if(acao==='editar'&&recebimentoDuplicados(s,next).length&&!root.confirm("Possível duplicidade: já existe outro recebimento deste aluno com a mesma data, valor e competência. Salvar mesmo assim?")){status.textContent="Confira o outro recebimento. Seu rascunho continua aqui.";return;}
      if(acao==='anular'&&!root.confirm("Anular este recebimento? Ele sai dos totais e da quitação, com o histórico preservado."))return;
      grava(s,id);d.close();if(al(s,id))ctx.perfil(id);
    }catch(e2){status.textContent=e2.message;}}
    d.querySelector('form').onsubmit=function(e){e.preventDefault();if(!anulado)envia('editar');};
    var bt=d.querySelector('[data-anular]');if(bt)bt.onclick=function(){envia('anular');};
  }
  api.perfil=function(a){if(!ctx||!a)return;var b=$('pfIrAgenda');if(b)b.hidden=online(a);document.querySelectorAll('#vPerfil [data-pfagendar],#vPerfil [data-alacao=agendar]').forEach(function(x){x.hidden=online(a);});};

  // Rascunhos e snapshots permanecem separados por conta, aluno e data.
  var planoAluno="",planoConta="",planoEstado=null,planoRascunhos=Object.create(null);
  function plmDate(s){var p=s.split('-'),d=new Date(2000,0,1,12);d.setFullYear(+p[0],+p[1]-1,+p[2]);return d;}
  function plmIso(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function plmHoje(){return plmIso(new Date());}
  function plmAdd(s,n){var d=plmDate(s);d.setDate(d.getDate()+n);return plmIso(d);}
  function plmSemana(s){return plmAdd(s,-((plmDate(s).getDay()+6)%7));}
  function plmTexto(s,curto){return plmDate(s).toLocaleDateString('pt-BR',curto?{day:'2-digit',month:'2-digit'}:{weekday:'long',day:'numeric',month:'long',year:'numeric'});}
  function plmProprio(t,d){return Object.prototype.hasOwnProperty.call(t.plano&&t.plano.datas||{},d);}
  function plmDia(t,d){return dia(t.plano,d,plmDate(d).getDay());}
  function plmBase(t,d){return JSON.stringify({proprio:plmProprio(t,d),data:(t.plano&&t.plano.datas||{})[d],semana:plmProprio(t,d)?null:(t.plano&&t.plano.dias||{})[String(plmDate(d).getDay())]});}
  function plmEditor(t,d){return {base:plmBase(t,d),rows:copy(plmDia(t,d)),proprio:plmProprio(t,d),opt:'',hora:'',edit:null,status:''};}
  function plmAtual(){return planoEstado&&planoEstado.editores[planoEstado.data];}
  function plmCaptura(){var ed=plmAtual();if(ed){ed.opt=$('r809DataTreino').value;ed.hora=$('r809DataHora').value;}}
  function plmStatus(s){var ed=plmAtual();if(ed)ed.status=s;$('r809DataStatus').textContent=s;}
  function plmNome(t,p){var o=opcoes(t).find(function(x){return x.tp===p.tp&&x.id===p.id;});return o?o.n:'Treino indisponível';}
  function plmCampos(t){
    var ed=plmAtual(),sel=$('r809DataTreino');if(!ed)return;
    var opts=opcoes(t);sel.innerHTML='<option value="">Escolha um treino</option>'+opts.map(function(o){return '<option value="'+esc(o.tp+':'+o.id)+'">'+esc(o.n)+'</option>';}).join('');
    if(ed.opt&&!opts.some(function(o){return o.tp+':'+o.id===ed.opt;}))sel.insertAdjacentHTML('beforeend','<option value="'+esc(ed.opt)+'">Treino indisponível — escolha outro</option>');
    sel.value=ed.opt;$('r809DataHora').value=ed.hora;$('r809Data').value=planoEstado.data;
    $('r809DataAdd').textContent=ed.edit===null?'Salvar nova atividade':'Salvar alteração';
    $('r809DataCancel').hidden=ed.edit===null;
    $('r809DataEditorTitulo').textContent=ed.edit===null?'Adicionar atividade':'Editar atividade '+(ed.edit+1);
  }
  function plmDesenha(t){
    var d=planoEstado.data,ed=plmAtual(),mes=planoEstado.mes,hoje=plmHoje(),first=mes+'-01',inicio=plmSemana(first),last=new Date(plmDate(first).getFullYear(),plmDate(first).getMonth()+1,0).getDate();
    var cells=Math.ceil((((plmDate(first).getDay()+6)%7)+last)/7)*7,html='';
    $('r809MesTitulo').textContent=plmDate(first).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
    for(var i=0;i<cells;i++){
      var iso=plmAdd(inicio,i),rows=plmDia(t,iso),own=plmProprio(t,iso),out=iso.slice(0,7)!==mes;
      var detalhe=rows.length?rows.map(function(p){return (p.h?p.h+' · ':'')+plmNome(t,p);}).join(', '):(own?'Descanso programado':'Sem atividade na semana recorrente');
      html+='<button type="button" class="plm-day'+(out?' plm-out':'')+(own?' plm-specific':'')+'" data-r809-date="'+iso+'" aria-label="'+esc(plmTexto(iso)+'. '+detalhe)+'" aria-pressed="'+(iso===d)+'"'+(iso===hoje?' aria-current="date"':'')+'><span class="plm-number">'+plmDate(iso).getDate()+'</span><span class="plm-day-detail">'+esc(rows.length?plmNome(t,rows[0]):own?'Descanso':'')+'</span><span class="plm-count">'+(rows.length?rows.length+'<span class="plm-count-label"> '+(rows.length===1?'atividade':'atividades')+'</span>':own?'—':'')+'</span></button>';
    }
    $('r809MesGrid').innerHTML=html;
    $('r809DiaTitulo').textContent=plmTexto(d);
    $('r809DiaOrigem').textContent=ed.proprio?'Ajuste desta data':'Semana recorrente salva';
    $('r809DataLista').innerHTML=ed.rows.length?ed.rows.map(function(p,i){return {p:p,i:i};}).sort(function(a,b){return (a.p.h||'99:99').localeCompare(b.p.h||'99:99');}).map(function(r){return '<li class="plm-activity"><div><span class="plm-time">'+esc(r.p.h||'Sem horário')+'</span><strong>'+esc(plmNome(t,r.p))+'</strong><span class="plm-type">'+esc({ficha:'Musculação',wod:'Circuito',cardio:'Corrida e bike'}[r.p.tp]||'Atividade')+'</span></div><div class="plm-item-actions"><button type="button" data-r809-edit="'+r.i+'" aria-label="Editar atividade '+(r.i+1)+': '+esc(plmNome(t,r.p))+'">Editar</button><button type="button" data-r809-del="'+d+':'+r.i+'" aria-label="Remover atividade '+(r.i+1)+': '+esc(plmNome(t,r.p))+'">Remover</button></div></li>';}).join(''):'<li class="plm-empty">'+(ed.proprio?'Descanso programado para esta data.':'Nenhuma atividade na semana recorrente para este dia.')+'</li>';
    var stale=ed.base!==plmBase(t,d);$('r809DataReload').hidden=!stale;
    $('r809DataStatus').textContent=stale?'Essa data mudou em outra sessão. Seu rascunho foi mantido. Recarregue o dia para conferir antes de salvar.':ed.status;
    $('r809DataReset').disabled=!ed.proprio;
  }
  function calendario(){
    if(!ctx||!$('r809Datas'))return;
    var id=$('plnAluno').value,conta=ctx.conta(),t=tDe(ctx.load(),id);
    $('r809Datas').hidden=!id;
    if(id!==planoAluno||conta!==planoConta||!planoEstado){
      plmCaptura();planoAluno=id;planoConta=conta;
      if(!id){planoEstado=null;return;}
      var key=JSON.stringify([conta,id]);planoEstado=planoRascunhos[key];
      if(!planoEstado){var hoje=plmHoje();planoEstado=planoRascunhos[key]={data:hoje,mes:hoje.slice(0,7),editores:Object.create(null)};planoEstado.editores[hoje]=plmEditor(t,hoje);}
    }else plmCaptura();
    plmCampos(t);plmDesenha(t);
  }
  function dataSelecionada(d){
    if(!planoEstado)return;d=typeof d==='string'?d:$('r809Data').value;
    if(!dataOk(d)){plmStatus('Escolha uma data válida.');return;}
    plmCaptura();planoEstado.data=d;planoEstado.mes=d.slice(0,7);
    var t=tDe(ctx.load(),planoAluno);if(!planoEstado.editores[d])planoEstado.editores[d]=plmEditor(t,d);
    plmCampos(t);plmDesenha(t);
  }
  function plmConfere(){
    if(!planoEstado||!planoAluno||$('plnAluno').value!==planoAluno||ctx.conta()!==planoConta)throw new Error('A conta ou o aluno mudou. Volte ao aluno deste rascunho antes de salvar.');
    if($('r809Data').value!==planoEstado.data||!dataOk(planoEstado.data))throw new Error('Escolha uma data válida.');
    // A identidade retornada por load preserva a proteção CAS local de MTStore.write.
    var st=ctx.load(),t=tDe(st,planoAluno);
    if(!al(st,planoAluno))throw new Error('Aluno não encontrado.');
    if(plmAtual().base!==plmBase(t,planoEstado.data))throw new Error('Essa data mudou em outra sessão. Seu rascunho foi mantido. Recarregue o dia para conferir antes de salvar.');
    return {st:st,t:t};
  }
  function mudaData(acao){try{
    plmCaptura();var atual=plmConfere(),st=atual.st,t=atual.t,id=planoAluno,d=planoEstado.data,ed=plmAtual(),ds=copy(t.plano&&t.plano.datas||{}),rows=copy(plmDia(t,d));
    if(acao==='add'){
      var opt=opcoes(t).find(function(o){return o.tp+':'+o.id===ed.opt;}),h=ed.hora;
      if(!opt||!horaOk(h))throw new Error('Escolha o treino e confira o horário.');
      if(ed.edit===null&&rows.length>=10)throw new Error('Use até 10 atividades por data.');
      if(ed.edit!==null&&!rows[ed.edit])throw new Error('A atividade mudou. Recarregue o dia antes de editar.');
      if(rows.some(function(p,i){return i!==ed.edit&&p.tp===opt.tp&&p.id===opt.id&&(p.h||'')===h;}))throw new Error('Esse treino já está programado nesse horário.');
      var item={tp:opt.tp,id:opt.id,h:h};if(ed.edit===null)rows.push(item);else rows[ed.edit]=Object.assign({},rows[ed.edit],item);ds[d]=rows;
    }else if(acao.indexOf('del:')===0){var ix=Number(acao.slice(4));if(!Number.isInteger(ix)||!rows[ix])throw new Error('A atividade mudou. Recarregue o dia.');if(!confirm('Remover '+plmNome(t,rows[ix])+' somente de '+plmTexto(d,true)+'?'))return;rows.splice(ix,1);ds[d]=rows;}
    else if(acao==='rest'){if(rows.length&&!confirm('Substituir as '+rows.length+' atividades de '+plmTexto(d,true)+' por descanso?'))return;ds[d]=[];}
    else if(acao==='reset'){if(!confirm('Remover o ajuste de '+plmTexto(d,true)+' e voltar à semana recorrente?'))return;delete ds[d];}
    else return;
    st.treinosV2=st.treinosV2||{};st.treinosV2[id]=t;t.plano=t.plano||{dias:{}};t.plano.datas=ds;
    grava(st,id,true);
    var next=plmEditor(t,d);next.opt=ed.opt;next.hora=ed.hora;next.status='Salvo no painel. Publique o planejamento para atualizar o app do aluno.';planoEstado.editores[d]=next;
    plmCampos(t);plmDesenha(t);
  }catch(e){plmStatus(e.message||String(e));if(planoEstado)$('r809DataReload').hidden=plmAtual().base===plmBase(tDe(ctx.load(),planoAluno),planoEstado.data);}}
  function plmCopia(){
    if(!planoEstado)return;plmCaptura();
    var aluno=planoAluno,conta=planoConta,semana=plmSemana(planoEstado.data),preview=null;
    var d=dialog('<form class="plm-copy"><h2>Copiar semana</h2><p>Copia os sete dias salvos, incluindo horários, atividades e descanso. Alterações da semana recorrente precisam ser salvas antes.</p><label>Semana de origem<input type="date" name="origem" required value="'+semana+'"></label><div class="r809-grid"><label>Primeira semana de destino<input type="date" name="destino" required value="'+plmAdd(semana,7)+'"></label><label>Semanas seguidas<input type="number" name="semanas" min="1" max="12" step="1" required value="1"></label></div><label>Datas com ajustes no destino<select name="modo"><option value="preservar">Manter ajustes existentes</option><option value="substituir">Substituir ajustes existentes</option></select></label><button type="button" data-plm-preview>Conferir cópia</button><div data-plm-resumo aria-live="polite"></div><label class="plm-confirm" hidden><input type="checkbox" name="confirma"><span data-plm-confirm-text></span></label><p role="status"></p><div class="r809-actions"><button type="button" data-cancel>Cancelar</button><button type="submit" disabled>Salvar cópia no painel</button></div></form>');
    d.classList.add('plm-dialog');var form=d.querySelector('form'),status=d.querySelector('[role=status]'),submit=d.querySelector('[type=submit]');
    function campo(n){return form.elements.namedItem(n);}
    function confereConta(){if(ctx.conta()!==conta||$('plnAluno').value!==aluno||planoAluno!==aluno||planoConta!==conta)throw new Error('A conta ou o aluno mudou. Volte ao aluno de origem antes de copiar.');}
    function semanaBase(t,start){var a=[];for(var i=0;i<7;i++)a.push(plmBase(t,plmAdd(start,i)));return JSON.stringify(a);}
    function conferePreview(){try{
      confereConta();var origem=campo('origem').value,destino=campo('destino').value,n=Number(campo('semanas').value),modo=campo('modo').value;
      if(!dataOk(origem)||!dataOk(destino)||!Number.isInteger(n)||n<1||n>12)throw new Error('Escolha datas válidas e de 1 a 12 semanas.');
      origem=plmSemana(origem);destino=plmSemana(destino);
      if(destino<=plmAdd(origem,6)&&plmAdd(destino,n*7-1)>=origem)throw new Error('As semanas de destino não podem incluir a semana de origem.');
      var st=ctx.load(),t=tDe(st,aluno);if(!al(st,aluno))throw new Error('Aluno não encontrado.');
      var source=[],targets=[],ocupados=0;
      for(var i=0;i<7;i++){var sd=plmAdd(origem,i),rows=copy(plmDia(t,sd));if(rows.length>10||rows.some(function(p){return !opcoes(t).some(function(o){return o.tp===p.tp&&o.id===p.id;})||!horaOk(p.h||'');}))throw new Error('A semana de origem tem atividades indisponíveis ou inválidas. Corrija antes de copiar.');source.push(rows);}
      for(var j=0;j<n*7;j++){var td=plmAdd(destino,j),own=plmProprio(t,td);if(own)ocupados++;targets.push({data:td,base:plmBase(t,td),rows:copy(source[j%7]),salvar:modo==='substituir'||!own});}
      preview={origem:origem,destino:destino,n:n,modo:modo,sourceBase:semanaBase(t,origem),targets:targets,ocupados:ocupados};
      campo('confirma').checked=false;d.querySelector('.plm-confirm').hidden=!(modo==='substituir'&&ocupados);d.querySelector('[data-plm-confirm-text]').textContent='Confirmo substituir os ajustes de '+ocupados+' datas no destino.';
      var quantidade=targets.filter(function(x){return x.salvar;}).length;
      d.querySelector('[data-plm-resumo]').innerHTML='<p><strong>Origem: '+esc(plmTexto(origem,true))+' a '+esc(plmTexto(plmAdd(origem,6),true))+'</strong></p><ul class="plm-copy-days">'+source.map(function(rows,i){return '<li><span>'+esc(plmDate(plmAdd(origem,i)).toLocaleDateString('pt-BR',{weekday:'short'}))+'</span><span>'+esc(rows.length?rows.map(function(p){return (p.h?p.h+' · ':'')+plmNome(t,p);}).join(' / '):'Descanso')+'</span></li>';}).join('')+'</ul><p>Destino: '+esc(plmTexto(destino,true))+' a '+esc(plmTexto(plmAdd(destino,n*7-1),true))+'. '+quantidade+' datas serão salvas. '+(ocupados?ocupados+' datas com ajustes serão '+(modo==='substituir'?'substituídas após sua confirmação.':'mantidas.'):'Nenhum ajuste existente será substituído.')+'</p>';
      status.textContent=quantidade?'Confira os dias e salve a cópia. Publicar no app continua sendo uma ação separada.':'Todas as datas já têm ajustes. Nenhuma data será alterada.';submit.disabled=!quantidade;
    }catch(e){preview=null;submit.disabled=true;status.textContent=e.message;}}
    form.addEventListener('input',function(e){if(e.target.name==='confirma')return;preview=null;submit.disabled=true;d.querySelector('[data-plm-resumo]').textContent='Os campos mudaram. Confira a cópia novamente.';d.querySelector('.plm-confirm').hidden=true;status.textContent='';});
    d.querySelector('[data-plm-preview]').onclick=conferePreview;d.querySelector('[data-cancel]').onclick=function(){d.close();};
    form.onsubmit=function(e){e.preventDefault();try{
      confereConta();if(!preview)throw new Error('Confira a cópia antes de salvar.');
      if(preview.modo==='substituir'&&preview.ocupados&&!campo('confirma').checked)throw new Error('Confirme a substituição dos ajustes indicados ou escolha mantê-los.');
      var st=ctx.load(),t=tDe(st,aluno);if(!al(st,aluno))throw new Error('Aluno não encontrado.');
      if(semanaBase(t,preview.origem)!==preview.sourceBase||preview.targets.some(function(x){return plmBase(t,x.data)!==x.base;}))throw new Error('Uma das datas mudou em outra sessão. Seu rascunho foi mantido. Confira a cópia novamente.');
      if(preview.targets.some(function(x){return x.salvar&&x.rows.some(function(p){return !opcoes(t).some(function(o){return o.tp===p.tp&&o.id===p.id;});});}))throw new Error('Um treino da origem não está mais disponível. Confira a cópia novamente.');
      st.treinosV2=st.treinosV2||{};st.treinosV2[aluno]=t;t.plano=t.plano||{dias:{}};t.plano.datas=t.plano.datas||{};var count=0;
      preview.targets.forEach(function(x){if(x.salvar){t.plano.datas[x.data]=copy(x.rows);count++;}});
      grava(st,aluno,true);d.close();calendario();plmStatus(count+' datas copiadas e salvas no painel. Publique o planejamento para atualizar o app do aluno.');
    }catch(err){status.textContent=err.message;}};
    conferePreview();
  }
  api.plano=calendario;

  var corridaAluno="",corridaConta="",corridaRasc={},corridaSerial="",zonaEdit=null,blocoEdit=null,etapaAberta=false;
  var zonasVistas={},blocoZonas={alvo:null,rec:null},ZONA_SNAPSHOT="__r809_prescrita__";
  var corridaCampos=['r809ZonaNome','r809ZonaTipo','r809ZonaMin','r809ZonaMax','r809BlocoTipo','r809BlocoReps','r809AlvoValor','r809AlvoUnidade','r809ZonaAlvo','r809RecValor','r809RecUnidade','r809ZonaRec','r809AlvoAcao','r809AlvoEsforco','r809AlvoMin','r809AlvoMax','r809AlvoOrientacao','r809RecAcao','r809RecEsforco','r809RecMin','r809RecMax','r809RecOrientacao'];
  function bsForm(){return blocos(JSON.parse($('cbBlocos').value||'[]'));}
  function corridaKey(){return JSON.stringify([corridaConta,corridaAluno]);}
  function corridaContexto(){var id=$('cbAluno').value;if(!id||id!==corridaAluno||ctx.conta()!==corridaConta||!al(ctx.load(),id))throw new Error('O aluno ou a conta mudou. Selecione novamente o aluno.');return id;}
  function corridaFoco(id){var el=$(id);for(var p=el.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;el.scrollIntoView({block:'nearest'});el.focus({preventScroll:true});}
  function blocoPendente(){return !!(blocoEdit||['r809Alvo','r809Rec'].some(function(p){return ['Valor','Min','Max','Orientacao'].some(function(k){return $(p+k).value.trim();});}));}
  function esforcoModo(p) {
    var tipo=$(p+'Esforco').value, direto=tipo&&tipo!=='zona';
    $(p+'Faixa').hidden=!direto;$(p+'ZonaBox').hidden=tipo!=='zona';
    var unidade={pace:'min/km',velocidade:'km/h',fc:'bpm',rpe:'de 1 a 10'}[tipo]||'';
    $(p+'MinLabel').firstChild.nodeValue=(tipo==='rpe'?'Sensação':tipo==='pace'?'Ritmo mais rápido':'Alvo mínimo')+' ('+unidade+')';
    $(p+'MaxLabel').firstChild.nodeValue=(tipo==='pace'?'Ritmo mais lento':'Até (opcional)')+' ('+unidade+')';
    $(p+'Min').placeholder=tipo==='pace'?'5:30':tipo==='fc'?'140':tipo==='rpe'?'5':'10';
    $(p+'Max').placeholder=tipo==='pace'?'6:00':tipo==='fc'?'155':tipo==='rpe'?'6':'12';
    $(p+'Hint').textContent=tipo==='rpe'?'1 · muito leve    10 · máximo':tipo==='pace'?'Minutos por quilômetro. Ex.: 5:30 a 6:00.':'Deixe o segundo campo vazio para usar um alvo único.';
  }
  function blocoModo(){
    var repetir=$('r809BlocoTipo').value==='repetir';$('r809RepsLabel').hidden=!repetir;$('r809RecBox').hidden=!repetir;
    $('r827EtapaEditor').hidden=!etapaAberta&&!blocoPendente();
    $('r809BlocoAdd').textContent=blocoEdit?'Salvar etapa':'Adicionar à sequência';$('r809BlocoCancel').hidden=false;$('r809BlocoCancel').textContent='Cancelar';
    $('r809BlocoTitulo').textContent=blocoEdit?'Editar etapa '+(blocoEdit.index+1):repetir?'Repetir duas etapas':'Nova etapa';
    esforcoModo('r809Alvo');esforcoModo('r809Rec');
  }
  function zonaModo(){$('r809ZonaAdd').textContent=zonaEdit?'Salvar alteração da zona':'Salvar zona';$('r809ZonaCancel').hidden=!zonaEdit&&!$('r809ZonaNome').value;$('r809ZonaTitulo').textContent=zonaEdit?'Editar zona':'Nova zona';var tipo=$('r809ZonaTipo').value;$('r809ZonaMin').placeholder=tipo==='pace'?'Ex.: 5:00':tipo==='fc'?'Ex.: 120':'Ex.: 8,5';$('r809ZonaMax').placeholder=tipo==='pace'?'Ex.: 6:00':tipo==='fc'?'Ex.: 150':'Ex.: 10';}
  function blocoLimpa(){
    blocoEdit=null;etapaAberta=false;blocoZonas={alvo:null,rec:null};$('r809BlocoTipo').value='ativo';$('r809BlocoReps').value='1';
    ['r809Alvo','r809Rec'].forEach(function(p){['Valor','Min','Max','Orientacao','Esforco'].forEach(function(k){$(p+k).value='';});$(p+'Acao').value=p==='r809Alvo'?'correr':'caminhar';});
    $('r809ZonaAlvo').value='';$('r809ZonaRec').value='';$('r809AlvoUnidade').value='km';$('r809RecUnidade').value='m';blocoModo();
  }
  function zonaLimpa(){zonaEdit=null;['r809ZonaNome','r809ZonaMin','r809ZonaMax'].forEach(function(k){$(k).value='';});$('r809ZonaTipo').value='pace';zonaModo();}
  function corridaGuarda(){if(!corridaAluno)return;var campos={};corridaCampos.forEach(function(k){campos[k]=$(k).value;});corridaRasc[corridaKey()]={campos:campos,zonaEdit:copy(zonaEdit),blocoEdit:copy(blocoEdit),blocoZonas:copy(blocoZonas),aberta:etapaAberta,serial:corridaSerial};}
  function zonaOptions(zs,keeps){[['r809ZonaAlvo','alvo'],['r809ZonaRec','rec']].forEach(function(par){var s=$(par[0]),v=keeps?keeps[par[0]]:s.value,z=blocoZonas[par[1]];s.innerHTML='<option value="">Sem zona definida</option>'+(z?'<option value="'+ZONA_SNAPSHOT+'">Manter zona prescrita: '+esc(zonaTxt(z))+'</option>':'')+zs.map(function(x){return '<option value="'+esc(x.id)+'">'+esc(zonaTxt(x))+'</option>';}).join('');s.value=v||'';if(v&&s.value!==v){var o=document.createElement('option');o.value=v;o.textContent='Zona removida — selecione outra';s.appendChild(o);s.value=v;}});}
  function alvoForm(p,k,zs){
    var tipo=$(p+'Esforco').value,v=tipo==='zona'?$(k).value:'',z=v===ZONA_SNAPSHOT?blocoZonas[p==='r809Alvo'?'alvo':'rec']:zs.find(function(x){return x.id===v;});
    if(tipo==='zona'&&(!v||!z))throw new Error('Selecione uma zona cadastrada ou escolha “Sem meta de esforço”.');
    var a={valor:$(p+'Valor').value,unidade:$(p+'Unidade').value,zona:z||null};
    if($(p+'Acao').value)a.acao=$(p+'Acao').value;
    if(tipo&&tipo!=='zona'){var min=$(p+'Min').value,max=$(p+'Max').value||min;a.esforco={tipo:tipo,min:tipo==='pace'?pace(min):numero(min,.01,300),max:tipo==='pace'?pace(max):numero(max,.01,300)};}
    if($(p+'Orientacao').value.trim())a.orientacao=$(p+'Orientacao').value.trim();
    return a;
  }
  function blocoForm(){var zs=tDe(ctx.load(),corridaAluno).zonasCorrida||[],b={tipo:$('r809BlocoTipo').value,repeticoes:$('r809BlocoReps').value,alvo:alvoForm('r809Alvo','r809ZonaAlvo',zs)};if(b.tipo==='repetir')b.recuperacao=alvoForm('r809Rec','r809ZonaRec',zs);return bloco(b);}
  function blocoPreview(){try{$('r809BlocoPreview').textContent=blocoTxt(blocoForm());}catch(e){$('r809BlocoPreview').textContent='Preencha a etapa para conferir a prévia antes de adicionar.';}}
  function bsDraw(){
    if(!$('r809BlocosLista'))return;
    try{
      var bs=bsForm(),etapas=expande(bs),km=0,segundos=0;
      etapas.forEach(function(e){km+=e.km;segundos+=e.s;});
      var totais=[];if(km)totais.push(String(Math.round(km*1000)/1000).replace('.',',')+' km');if(segundos)totais.push(segundos>=60?String(Math.round(segundos/60*10)/10).replace('.',',')+' min':segundos+' s');
      $('r809BlocosResumo').textContent=bs.length?etapas.length+' etapas'+(totais.length?' · '+totais.join(' + '):''):'Adicione a primeira etapa';
      $('r809BlocosLista').innerHTML=bs.map(function(b,i){
        var titulo=b.tipo==='repetir'?'Repetir '+b.repeticoes+'×':acaoTxt(b.alvo)||{aquecimento:'Aquecimento',ativo:'Ativo',recuperacao:'Recuperação final'}[b.tipo];
        var texto=b.tipo==='repetir'?(acaoTxt(b.alvo)||'Ativo')+' · '+alvoTxt(b.alvo)+' → '+(acaoTxt(b.recuperacao)||'Recuperação')+' · '+alvoTxt(b.recuperacao):alvoTxt(b.alvo);
        return '<li class="r809-corrida-row"><span class="r827-step-number">'+String(i+1).padStart(2,'0')+'</span><button type="button" class="r827-step-main" data-r809-block-edit="'+i+'" aria-label="Editar etapa '+(i+1)+'"><strong>'+esc(titulo)+'</strong><span>'+esc(texto)+'</span></button><details class="r827-step-menu"><summary aria-label="Opções da etapa '+(i+1)+'">⋯</summary><div class="r809-corrida-actions"><button type="button" data-r809-block-copy="'+i+'">Duplicar</button><button type="button" data-r809-block-up="'+i+'"'+(!i?' disabled':'')+'>↑ Subir</button><button type="button" data-r809-block-down="'+i+'"'+(i===bs.length-1?' disabled':'')+'>↓ Descer</button><button type="button" data-r809-block="'+i+'">Remover</button></div></details></li>';
      }).join('')||'<li class="r809-corrida-empty">Cada trecho pode ter sua própria distância, tempo e esforço.</li>';
    }catch(e){$('r809BlocosResumo').textContent='Confira a sequência.';$('r809BlocosLista').innerHTML='<li class="r809-corrida-empty">'+esc(e.message)+'. O conteúdo original foi mantido.</li>';}
    $('r809BlocosBox').hidden=$('cbModo').value==='simples';$('r809Corrida').querySelector('[data-r827-add="correr"]').textContent=$('cbMod').value==='bike'?'+ Pedalar':$('cbMod').value==='caminhada'?'+ Etapa':'+ Correr';blocoPreview();
  }
  function bsWrite(bs){$('cbBlocos').value=JSON.stringify(blocos(bs));corridaSerial=$('cbBlocos').value;bsDraw();corridaGuarda();}
  function blocoAbrir(i){
    var bs=bsForm(),b=bs[i];if(!b)return;if(blocoPendente()&&!confirm('Substituir o rascunho da etapa?'))return;
    blocoEdit={index:i,base:JSON.stringify(bs)};etapaAberta=true;blocoZonas={alvo:copy(b.alvo.zona),rec:b.recuperacao?copy(b.recuperacao.zona):null};$('r809BlocoTipo').value=b.tipo;$('r809BlocoReps').value=b.repeticoes;
    [['r809Alvo',b.alvo],['r809Rec',b.recuperacao]].forEach(function(par){var p=par[0],a=par[1];$(p+'Valor').value=a?a.valor:'';$(p+'Unidade').value=a?a.unidade:'m';$(p+'Acao').value=a?a.acao||'':'caminhar';$(p+'Esforco').value=a&&a.zona?'zona':a&&a.esforco?a.esforco.tipo:'';$(p+'Min').value=a&&a.esforco?zNum(a.esforco.min,a.esforco.tipo):'';$(p+'Max').value=a&&a.esforco&&a.esforco.max!==a.esforco.min?zNum(a.esforco.max,a.esforco.tipo):'';$(p+'Orientacao').value=a&&a.orientacao||'';});
    zonaOptions(tDe(ctx.load(),corridaAluno).zonasCorrida||[],{r809ZonaAlvo:b.alvo.zona?ZONA_SNAPSHOT:'',r809ZonaRec:b.recuperacao&&b.recuperacao.zona?ZONA_SNAPSHOT:''});blocoModo();blocoPreview();corridaGuarda();corridaFoco('r809AlvoValor');
  }
  function zonasDraw(){
    if(!ctx||!$('r809Corrida'))return;var id=$('cbAluno').value,conta=ctx.conta(),st=ctx.load(),zs=tDe(st,id).zonasCorrida||[],changed=id!==corridaAluno||conta!==corridaConta,restored=null;$('r809Corrida').hidden=!id;
    if(changed){corridaGuarda();corridaAluno=id;corridaConta=conta;zonaLimpa();blocoLimpa();restored=corridaRasc[corridaKey()];if(restored){corridaCampos.forEach(function(k){if(k.indexOf('r809ZonaAlvo')<0&&k.indexOf('r809ZonaRec')<0)$(k).value=restored.campos[k];});zonaEdit=copy(restored.zonaEdit);etapaAberta=!!restored.aberta;if(restored.serial===($('cbBlocos').value||'[]')){blocoEdit=copy(restored.blocoEdit);blocoZonas=copy(restored.blocoZonas);}else{blocoLimpa();restored=null;}}$('r809CorridaStatus').textContent='';}
    else if(corridaSerial!==($('cbBlocos').value||'[]'))blocoLimpa();
    corridaSerial=$('cbBlocos').value||'[]';zonaOptions(zs,restored&&restored.campos);zonasVistas={};zs.forEach(function(z){zonasVistas[z.id]=copy(z);});
    $('r809ZonasLista').innerHTML=zs.map(function(z){return '<li class="r809-corrida-row"><div class="r809-corrida-info"><h4>'+esc(z.nome)+'</h4><p>'+esc(zonaTxt(z))+'</p></div><div class="r809-corrida-actions"><button type="button" data-r809-zone-edit="'+esc(z.id)+'">Editar zona</button><button type="button" data-r809-zone-copy="'+esc(z.id)+'">Duplicar zona</button><button type="button" data-r809-zone="'+esc(z.id)+'">Remover zona</button></div></li>';}).join('')||'<li class="r809-corrida-empty">Nenhuma zona cadastrada para este aluno.</li>';
    zonaModo();blocoModo();bsDraw();
  }
  function zonaAbrir(z,duplicar){if((zonaEdit||$('r809ZonaNome').value)&&!confirm('Substituir o rascunho da zona?'))return;zonaEdit=duplicar?null:{id:z.id,base:JSON.stringify(z)};$('r809ZonaNome').value=duplicar?(z.nome.slice(0,52)+' (cópia)'):z.nome;$('r809ZonaTipo').value=z.tipo;$('r809ZonaMin').value=zNum(z.min,z.tipo);$('r809ZonaMax').value=zNum(z.max,z.tipo);zonaModo();corridaFoco('r809ZonaNome');}
  function zonaSave(){try{var id=corridaContexto(),st=ctx.load(),zs=tDe(st,id).zonasCorrida||[],index=zonaEdit?zs.findIndex(function(z){return z.id===zonaEdit.id;}):-1;if(zonaEdit&&(index<0||JSON.stringify(zs[index])!==zonaEdit.base))throw new Error('Esta zona mudou em outra sessão. Seu rascunho foi mantido; cancele e reabra a zona para conferir.');var z=zona({id:zonaEdit?zonaEdit.id:uid(),nome:$('r809ZonaNome').value,tipo:$('r809ZonaTipo').value,min:$('r809ZonaMin').value,max:$('r809ZonaMax').value});if(!zonaEdit&&zs.length>=100)throw new Error('Limite de 100 zonas por aluno.');st.treinosV2=st.treinosV2||{};var t=st.treinosV2[id]=st.treinosV2[id]||{fichas:[]};t.zonasCorrida=zs.slice();if(zonaEdit)t.zonasCorrida[index]=z;else t.zonasCorrida.push(z);if(ctx.save(st)===false)throw new Error('Não foi possível salvar a zona. Seu rascunho foi mantido.');zonaLimpa();zonasDraw();$('r809CorridaStatus').textContent='Zona salva na biblioteca deste aluno. Os blocos existentes mantêm os alvos prescritos.';corridaGuarda();}catch(e){msg('r809CorridaStatus',e);}}
  api.corrida=zonasDraw;
  api.corridaPendente=blocoPendente;
  api.corridaLimpa=function(){if(!$('r809BlocoTipo'))return;blocoLimpa();corridaSerial=$('cbBlocos').value||'[]';corridaGuarda();bsDraw();};
  api.init=function(c){
    if(ctx)return;ctx=c;
    document.addEventListener('click',function(e){var b=e.target.closest('[data-edita-pagamento]');if(b){e.preventDefault();pagamento(b.getAttribute('data-edita-pagamento'));}});
    var ds=document.createElement('section');ds.id='r809Datas';ds.className='r809-card plm-calendar';
    ds.innerHTML='<div class="plm-heading"><div><h3>Calendário mensal</h3><p>Selecione um dia para ajustar atividades e horários. O mês mostra a programação salva.</p></div><button type="button" id="r809CopiaSemana">Copiar semana</button></div><div class="plm-layout"><div class="plm-month"><div class="plm-toolbar"><h4 id="r809MesTitulo" aria-live="polite"></h4><div class="plm-nav"><button type="button" id="r809MesAnterior" aria-label="Mês anterior">‹</button><button type="button" id="r809MesHoje">Hoje</button><button type="button" id="r809MesProximo" aria-label="Próximo mês">›</button></div></div><div class="plm-scroll" tabindex="0" role="group" aria-labelledby="r809MesTitulo"><div class="plm-weekdays" aria-hidden="true"><span>Seg</span><span>Ter</span><span>Qua</span><span>Qui</span><span>Sex</span><span>Sáb</span><span>Dom</span></div><div id="r809MesGrid" class="plm-grid"></div></div><p class="plm-legend"><span class="plm-legend-dot"></span>Ajuste por data <span>·</span> Os outros dias seguem a semana recorrente.</p></div><div class="plm-agenda"><span id="r809DiaOrigem" class="plm-origin"></span><h4 id="r809DiaTitulo"></h4><ol id="r809DataLista" class="plm-activities"></ol><div class="plm-editor"><h4 id="r809DataEditorTitulo">Adicionar atividade</h4><div class="r809-grid"><label>Data<input type="date" id="r809Data"></label><label>Horário (opcional)<input type="time" id="r809DataHora"></label><label class="plm-training">Treino deste aluno<select id="r809DataTreino"></select></label></div><div class="r809-actions"><button type="button" class="plm-primary" id="r809DataAdd">Salvar nova atividade</button><button type="button" id="r809DataCancel" hidden>Cancelar edição</button></div><p id="r809DataStatus" role="status"></p><button type="button" id="r809DataReload" hidden>Recarregar dia</button><div class="plm-day-actions"><button type="button" id="r809DataRest">Programar descanso</button><button type="button" id="r809DataReset">Voltar à semana recorrente</button></div><p>Salvar atualiza o painel. Use Publicar no app para enviar ao aluno.</p></div></div></div>';
    $('plnResumo').insertAdjacentElement('beforebegin',ds);
    var recorrente=document.createElement('h3');recorrente.className='plm-week-title';recorrente.textContent='Semana recorrente';$('plnResumo').insertAdjacentElement('beforebegin',recorrente);
    $('r809Data').onchange=function(){dataSelecionada();};
    ['r809DataHora','r809DataTreino'].forEach(function(k){$(k).addEventListener('input',plmCaptura);$(k).addEventListener('change',plmCaptura);});
    $('r809DataAdd').onclick=function(){mudaData('add');};$('r809DataRest').onclick=function(){mudaData('rest');};$('r809DataReset').onclick=function(){mudaData('reset');};
    $('r809CopiaSemana').onclick=plmCopia;
    function mesMove(n){if(!planoEstado)return;var m=plmDate(planoEstado.mes+'-01');m.setMonth(m.getMonth()+n);planoEstado.mes=plmIso(m).slice(0,7);plmDesenha(tDe(ctx.load(),planoAluno));}
    $('r809MesAnterior').onclick=function(){mesMove(-1);};$('r809MesProximo').onclick=function(){mesMove(1);};$('r809MesHoje').onclick=function(){dataSelecionada(plmHoje());};
    $('r809MesGrid').onclick=function(e){var b=e.target.closest('[data-r809-date]');if(b)dataSelecionada(b.dataset.r809Date);};
    $('r809MesGrid').onkeydown=function(e){var b=e.target.closest('[data-r809-date]'),offset={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[e.key];if(!b||!offset)return;e.preventDefault();var d=plmAdd(b.dataset.r809Date,offset);dataSelecionada(d);var next=$('r809MesGrid').querySelector('[data-r809-date="'+d+'"]');if(next)next.focus();};
    $('r809DataCancel').onclick=function(){var ed=plmAtual();if(!ed)return;ed.edit=null;ed.opt='';ed.hora='';plmCampos(tDe(ctx.load(),planoAluno));plmStatus('Edição cancelada. As atividades salvas foram mantidas.');};
    $('r809DataReload').onclick=function(){if(!planoEstado)return;var ed=plmAtual();plmCaptura();if(ed.edit!==null&&!confirm('Descartar a edição desta atividade e conferir a versão atual do dia?'))return;var t=tDe(ctx.load(),planoAluno),novo=plmEditor(t,planoEstado.data);if(ed.edit===null){novo.opt=ed.opt;novo.hora=ed.hora;}planoEstado.editores[planoEstado.data]=novo;plmCampos(t);plmDesenha(t);};
    $('r809DataLista').onclick=function(e){var edit=e.target.closest('[data-r809-edit]'),del=e.target.closest('[data-r809-del]');if(edit){var ed=plmAtual(),i=Number(edit.dataset.r809Edit),p=ed.rows[i];if(!p)return;ed.edit=i;ed.opt=p.tp+':'+p.id;ed.hora=p.h||'';plmCampos(tDe(ctx.load(),planoAluno));$('r809DataTreino').focus();}if(del)mudaData('del:'+del.dataset.r809Del.split(':')[1]);};
    var cr=document.createElement('section');cr.id='r809Corrida';cr.className='r809-card';
    function target(p,label){
      var zonaId=p==='r809Alvo'?'r809ZonaAlvo':'r809ZonaRec';
      return '<fieldset aria-label="'+label+'">'+(p==='r809Rec'?'<legend>'+label+'</legend>':'')+'<div class="r809-grid"><label>Atividade<select id="'+p+'Acao"><option value="correr">Correr</option><option value="caminhar">Caminhar</option><option value="pedalar">Pedalar</option><option value="aquecer">Aquecer</option><option value="recuperar">Recuperar</option><option value="">Manter tipo original</option></select></label><label>Distância ou tempo<div class="r827-measure"><input id="'+p+'Valor" inputmode="decimal" placeholder="Quantidade" aria-label="Quantidade da etapa"><select id="'+p+'Unidade" aria-label="Unidade da etapa"><option value="km">km</option><option value="m">metros</option><option value="min">minutos</option><option value="s">segundos</option></select></div></label></div><label>Esforço (opcional)<select id="'+p+'Esforco"><option value="">Sem meta de esforço</option><option value="rpe">Sensação de esforço · 1 a 10</option><option value="pace">Ritmo · min/km</option><option value="fc">Frequência cardíaca · bpm</option><option value="velocidade">Velocidade · km/h</option><option value="zona">Zona cadastrada do aluno</option></select></label><div id="'+p+'Faixa" class="r827-effort-fields" hidden><div class="r809-grid"><label id="'+p+'MinLabel">Alvo<input id="'+p+'Min" inputmode="decimal"></label><label id="'+p+'MaxLabel">Até<input id="'+p+'Max" inputmode="decimal"></label></div><p id="'+p+'Hint" class="r827-field-hint"></p></div><label id="'+p+'ZonaBox" hidden>Zona<select id="'+zonaId+'"></select></label><details class="r827-step-note"><summary>Orientação desta etapa</summary><label>Orientação (opcional)<input id="'+p+'Orientacao" maxlength="240" placeholder="Ex.: caminhar até o próximo trecho"></label></details></fieldset>';
    }
    cr.innerHTML='<section id="r809BlocosBox"><div class="r827-sequence-head"><h3>Sequência do treino</h3><p id="r809BlocosResumo" class="r809-corrida-summary" aria-live="polite"></p></div><ol id="r809BlocosLista" class="r809-corrida-list" aria-label="Sequência do treino"></ol><div class="r827-quick-actions"><button type="button" data-r827-add="correr">+ Correr</button><button type="button" data-r827-add="caminhar">+ Caminhar</button><button type="button" data-r827-add="outra">+ Outra etapa</button><button type="button" data-r827-add="repetir">↻ Repetições</button></div><div id="r827EtapaEditor" class="r809-corrida-editor" hidden><div class="r827-editor-head"><h4 id="r809BlocoTitulo">Nova etapa</h4><select id="r809BlocoTipo" aria-label="Estrutura da etapa"><option value="ativo">Etapa única</option><option value="repetir">Repetir duas etapas</option><option value="aquecimento">Aquecimento</option><option value="recuperacao">Recuperação final</option></select></div><div class="r827-repeat-count"><label id="r809RepsLabel" hidden>Quantas vezes?<input id="r809BlocoReps" type="number" min="1" max="20" value="1"></label></div>'+target('r809Alvo','Etapa')+'<div id="r809RecBox" hidden>'+target('r809Rec','Depois, em cada repetição')+'</div><div class="r809-corrida-preview"><strong>Como o aluno verá</strong><p id="r809BlocoPreview" aria-live="polite"></p></div><div class="r809-actions"><button type="button" id="r809BlocoAdd">Adicionar à sequência</button><button type="button" id="r809BlocoCancel">Cancelar</button></div></div></section><details id="r809ZonasBox"><summary>Zonas do aluno</summary><p>Faixas salvas para reutilizar nas etapas. Os treinos já prescritos mantêm seus valores.</p><ul id="r809ZonasLista" class="r809-corrida-list" aria-label="Biblioteca de zonas"></ul><h4 id="r809ZonaTitulo">Nova zona</h4><div class="r809-grid"><label>Nome<input id="r809ZonaNome" maxlength="60" placeholder="Ex.: Rodagem confortável"></label><label>Medida<select id="r809ZonaTipo"><option value="pace">Ritmo (min/km)</option><option value="velocidade">Velocidade (km/h)</option><option value="fc">Frequência cardíaca (bpm)</option></select></label><label>De<input id="r809ZonaMin" placeholder="Ex.: 5:00"></label><label>Até<input id="r809ZonaMax" placeholder="Ex.: 6:00"></label></div><div class="r809-actions"><button type="button" id="r809ZonaAdd">Salvar zona</button><button type="button" id="r809ZonaCancel" hidden>Cancelar edição da zona</button></div></details><p id="r809CorridaStatus" role="status" aria-live="polite"></p>';
    $('cbObs').closest('label').insertAdjacentElement('beforebegin',cr);
    cr.querySelector('.r827-quick-actions').onclick=function(e){
      var b=e.target.closest('[data-r827-add]');if(!b)return;
      try{corridaContexto();if(blocoPendente()&&!confirm('Substituir o rascunho da etapa?'))return;blocoLimpa();etapaAberta=true;
        var acao=b.dataset.r827Add;$('r809BlocoTipo').value=acao==='repetir'?'repetir':'ativo';$('r809AlvoAcao').value=acao==='caminhar'?'caminhar':$('cbMod').value==='bike'?'pedalar':$('cbMod').value==='caminhada'?'caminhar':'correr';$('r809AlvoUnidade').value=acao==='caminhar'?'m':'km';
        blocoModo();blocoPreview();corridaGuarda();corridaFoco(acao==='outra'?'r809AlvoAcao':'r809AlvoValor');
      }catch(err){msg('r809CorridaStatus',err);}
    };
    $('cbSalva').addEventListener('click',function(e){try{if($('cbAluno').value)corridaContexto();if(blocoPendente())throw new Error('Adicione ou salve o etapa em edição antes de salvar o treino. Você também pode cancelar a edição da etapa.');}catch(err){e.preventDefault();e.stopImmediatePropagation();msg('cbStatus',err);msg('r809CorridaStatus',err);if(blocoPendente())corridaFoco('r809BlocoAdd');}},true);
    $('cbMod').addEventListener('change',bsDraw);
    cr.addEventListener('keydown',function(e){if(e.key==='Escape'){var menu=e.target.closest('.r827-step-menu');if(menu&&menu.open){menu.open=false;menu.querySelector('summary').focus();e.preventDefault();}}});
    document.addEventListener('click',function(e){cr.querySelectorAll('.r827-step-menu[open]').forEach(function(menu){if(!menu.contains(e.target))menu.open=false;});});
    cr.addEventListener('input',function(){zonaModo();blocoModo();blocoPreview();corridaGuarda();});
    cr.addEventListener('change',function(){zonaModo();blocoModo();blocoPreview();corridaGuarda();});
    $('r809ZonaAdd').onclick=zonaSave;
    $('r809ZonaCancel').onclick=function(){zonaLimpa();zonasDraw();corridaGuarda();$('r809CorridaStatus').textContent='Edição da zona cancelada. A biblioteca foi mantida.';};
    $('r809BlocoCancel').onclick=function(){blocoLimpa();zonaOptions(tDe(ctx.load(),corridaAluno).zonasCorrida||[]);bsDraw();corridaGuarda();$('r809CorridaStatus').textContent='Edição do bloco cancelada. A sequência foi mantida.';};
    $('r809BlocoAdd').onclick=function(){try{corridaContexto();var b=blocoForm(),bs=bsForm(),edit=!!blocoEdit;if(blocoEdit){if(JSON.stringify(bs)!==blocoEdit.base)throw new Error('A sequência mudou. Cancele e reabra o bloco para conferir.');bs[blocoEdit.index]=b;}else bs.push(b);blocos(bs);blocoLimpa();bsWrite(bs);zonaOptions(tDe(ctx.load(),corridaAluno).zonasCorrida||[]);$('r809CorridaStatus').textContent=(edit?'Bloco atualizado':'Bloco adicionado')+' no rascunho. Salve o treino para aplicar.';}catch(e){msg('r809CorridaStatus',e);}};
    $('r809BlocosLista').onclick=function(e){var b=e.target.closest('button');if(!b)return;try{corridaContexto();if(b.hasAttribute('data-r809-block-edit')){blocoAbrir(+b.dataset.r809BlockEdit);return;}if(blocoEdit)throw new Error('Salve ou cancele a edição da etapa antes de mudar a sequência.');var bs=bsForm(),i,j,acao;if(b.hasAttribute('data-r809-block')){i=+b.dataset.r809Block;if(!confirm('Remover o bloco '+(i+1)+' do rascunho?'))return;bs.splice(i,1);acao='Bloco removido';}else if(b.hasAttribute('data-r809-block-copy')){i=+b.dataset.r809BlockCopy;bs.splice(i+1,0,copy(bs[i]));acao='Bloco duplicado';}else{var up=b.hasAttribute('data-r809-block-up');i=+(up?b.dataset.r809BlockUp:b.dataset.r809BlockDown);j=i+(up?-1:1);if(j<0||j>=bs.length)return;var temp=bs[i];bs[i]=bs[j];bs[j]=temp;acao='Ordem atualizada';}bsWrite(bs);$('r809CorridaStatus').textContent=acao+' no rascunho. Salve o treino para aplicar.';var focus=$('r809BlocosLista').querySelector('[data-r809-block-edit="'+Math.max(0,Math.min(j==null?i:j,bs.length-1))+'"]');if(focus)focus.focus();}catch(err){msg('r809CorridaStatus',err);}};
    $('r809ZonasLista').onclick=function(e){var b=e.target.closest('button');if(!b)return;try{var id=corridaContexto(),key=b.dataset.r809ZoneEdit||b.dataset.r809ZoneCopy||b.dataset.r809Zone,z=zonasVistas[key];if(!z)return;if(b.hasAttribute('data-r809-zone-edit')||b.hasAttribute('data-r809-zone-copy')){zonaAbrir(z,b.hasAttribute('data-r809-zone-copy'));return;}if(!confirm('Remover a zona da biblioteca? Os treinos já prescritos serão preservados.'))return;var st=ctx.load(),t=tDe(st,id),atual=(t.zonasCorrida||[]).find(function(x){return x.id===key;});if(JSON.stringify(atual)!==JSON.stringify(z))throw new Error('Esta zona mudou em outra sessão. Atualize a lista antes de remover.');t.zonasCorrida=(t.zonasCorrida||[]).filter(function(x){return x.id!==key;});if(ctx.save(st)===false)throw new Error('Não foi possível remover a zona.');if(zonaEdit&&zonaEdit.id===key)zonaLimpa();zonasDraw();$('r809CorridaStatus').textContent='Zona removida da biblioteca. Os blocos existentes foram preservados.';corridaGuarda();}catch(err){msg('r809CorridaStatus',err);}};
    calendario();zonasDraw();
  };
})(typeof self!=="undefined"?self:globalThis);
