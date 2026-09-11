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
  function alvo(x) {
    if (!x || ["km","min","s"].indexOf(x.unidade)<0) throw new Error("Escolha a unidade do bloco.");
    var v = numero(x.valor, .01, x.unidade === "km" ? 500 : x.unidade === "min" ? 1440 : 86400);
    if (x.zona && !zonaValida(x.zona)) throw new Error("A zona do bloco não é válida. Selecione-a novamente.");
    return {valor:v, unidade:x.unidade, zona:x.zona ? copy(x.zona) : null};
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
  function alvoTxt(a) { return String(a.valor).replace(".",",")+" "+a.unidade+(a.zona?" · "+zonaTxt(a.zona):""); }
  function blocoTxt(b) { var nomes={aquecimento:"Aquecimento",ativo:"Ativo",repetir:"Repetir",recuperacao:"Recuperação"}; return nomes[b.tipo]+(b.tipo==="repetir"?" "+b.repeticoes+"×":"")+": "+alvoTxt(b.alvo)+(b.recuperacao?" / "+alvoTxt(b.recuperacao):""); }
  function expande(bs) {
    var out=[];
    function add(a,k,n){out.push({k:k,n:n,d:alvoTxt(a),s:a.unidade==="km"?0:a.valor*(a.unidade==="min"?60:1),km:a.unidade==="km"?a.valor:0});}
    blocos(bs).forEach(function(b){if(b.tipo==="repetir"){for(var i=0;i<b.repeticoes;i++){add(b.alvo,"f","Ativo "+(i+1)+" de "+b.repeticoes);add(b.recuperacao,"l","Recuperação "+(i+1)+" de "+b.repeticoes);}}else add(b.alvo,b.tipo==="aquecimento"?"aq":b.tipo==="recuperacao"?"vc":"c",{aquecimento:"Aquecimento",ativo:"Ativo",recuperacao:"Recuperação"}[b.tipo]);});return out;
  }
  var api={atendimento:atendimento,online:online,pacotePrePago:pacotePrePago,dataOk:dataOk,horaOk:horaOk,dia:dia,opcoes:opcoes,pacoteDatas:pacoteDatas,zona:zona,zonaTxt:zonaTxt,blocos:blocos,blocoTxt:blocoTxt,expande:expande};
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
  function pagamento(pid){
    if(!ctx.financeiro())return;
    var st=ctx.load(),p=(st.pagamentos||[]).find(function(x){return x.id===pid;});if(!p)return;
    var original=JSON.stringify(p),conta=ctx.conta(),id=p.alunoId;
    if(!al(st,id))return;
    var d=dialog('<form><h2>Editar recebimento</h2><p>Corrija o lançamento. Isso não altera cobranças no banco ou no cartão.</p><label>Data<input name="data" type="date" required value="'+esc(p.data)+'"></label><label>Valor (R$)<input name="valor" type="number" min="0" step="0.01" required value="'+esc(p.valor)+'"></label><label>Competência (opcional)<input name="mes" type="month" value="'+esc(p.mes||"")+'"></label><label>Forma<input name="forma" maxlength="80" value="'+esc(p.forma||"")+'"></label><label>Descrição<input name="desc" maxlength="200" value="'+esc(p.desc||"")+'"></label><p role="status"></p><div class="r809-actions"><button type="button" data-cancel>Cancelar</button><button type="submit">Salvar alteração</button></div></form>');
    d.querySelector('[data-cancel]').onclick=function(){d.close();};
    d.querySelector('form').onsubmit=function(e){e.preventDefault();var status=d.querySelector('[role=status]');try{
      if(!ctx.financeiro()||ctx.conta()!==conta)throw new Error("A conta ou permissão mudou. Feche e reabra o recebimento.");
      var s=ctx.load(),i=(s.pagamentos||[]).findIndex(function(x){return x.id===pid&&x.alunoId===id;});
      if(i<0||JSON.stringify(s.pagamentos[i])!==original)throw new Error("Este recebimento mudou em outra sessão. Seu rascunho não foi salvo; feche e confira a versão atual.");
      var fd=new FormData(e.currentTarget),data=String(fd.get('data')||""),mes=String(fd.get('mes')||""),v=numero(fd.get('valor'),0,1e12);
      if(!dataOk(data)|| (mes&&!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)))throw new Error("Confira a data e a competência.");
      var next=Object.assign({},s.pagamentos[i],{data:data,valor:Math.round(v*100)/100,forma:String(fd.get('forma')||"").trim().slice(0,80),desc:String(fd.get('desc')||"").trim().slice(0,200)});
      if(mes)next.mes=mes;else delete next.mes;
      if(JSON.stringify(next)===original){d.close();return;}
      s.pagamentosAuditoria=Array.isArray(s.pagamentosAuditoria)?s.pagamentosAuditoria:[];
      s.pagamentosAuditoria.push({id:uid(),pagamentoId:pid,alunoId:id,em:new Date().toISOString(),por:conta,antes:copy(s.pagamentos[i]),depois:copy(next)});
      s.pagamentos[i]=next;grava(s,id);d.close();ctx.perfil(id);
    }catch(e2){status.textContent=e2.message;}};
  }
  api.perfil=function(a){if(!ctx||!a)return;var b=$('pfIrAgenda');if(b)b.hidden=online(a);document.querySelectorAll('#vPerfil [data-pfagendar],#vPerfil [data-alacao=agendar]').forEach(function(x){x.hidden=online(a);});};

  var planoAluno="",planoConta="",dataBase=null,planoRows={};
  function calendario(){
    if(!ctx||!$('r809Datas'))return;
    var id=$('plnAluno').value,st=ctx.load(),t=tDe(st,id),conta=ctx.conta();
    $('r809Datas').hidden=!id;
    var changed=id!==planoAluno||conta!==planoConta;
    if(changed){planoAluno=id;planoConta=conta;$('r809Data').value="";$('r809DataHora').value="";dataBase=null;}
    var sel=$('r809DataTreino'),keep=sel.value;
    sel.innerHTML='<option value="">Escolha um treino</option>'+opcoes(t).map(function(o){return '<option value="'+esc(o.tp+":"+o.id)+'">'+esc(o.n)+'</option>';}).join("");sel.value=keep;
    var ds=t.plano&&t.plano.datas||{};planoRows={};Object.keys(ds).forEach(function(d){planoRows[d]=JSON.stringify(ds[d]);});
    $('r809DataLista').innerHTML=Object.keys(ds).filter(dataOk).sort().map(function(d){var ns=dia(t.plano,d,-1).map(function(p){var o=opcoes(t).find(function(x){return x.tp===p.tp&&x.id===p.id;});return (p.h?p.h+" · ":"")+(o?o.n:"Treino indisponível");});return '<div class="r809-row"><div><b>'+esc(d)+'</b><p>'+esc(ns.join(" / ")||"Descanso programado")+'</p>'+ns.map(function(n,i){return '<button type="button" data-r809-del="'+d+':'+i+'">Remover atividade '+(i+1)+'</button>';}).join('')+'</div><button type="button" data-r809-date="'+d+'">Editar data</button></div>';}).join("")||'<p>Sem exceções por data. A semana recorrente continua valendo.</p>';
    // Não sobrescrever o snapshot do editor aberto após uma sincronização.
    if(changed) $('r809DataStatus').textContent="";
  }
  function dataSelecionada(){var st=ctx.load(),ds=tDe(st,$('plnAluno').value).plano||{};dataBase=JSON.stringify((ds.datas||{})[$('r809Data').value]);$('r809DataStatus').textContent="Adicionar inclui outro treino no mesmo dia. Descanso substitui os treinos dessa data.";}
  function mudaData(acao){try{
    var id=$('plnAluno').value,d=$('r809Data').value;
    if(!id||id!==planoAluno||ctx.conta()!==planoConta)throw new Error("Escolha novamente o aluno.");
    if(!dataOk(d))throw new Error("Escolha uma data válida.");
    var st=ctx.load(),t=tDe(st,id),ds=t.plano&&t.plano.datas||{};
    if(JSON.stringify(ds[d])!==dataBase)throw new Error("Essa data mudou em outra sessão. Selecione a data novamente para conferir.");
    if(!al(st,id))throw new Error("Aluno não encontrado.");
    if(acao==='add'){
      var opt=opcoes(t).find(function(o){return o.tp+":"+o.id===$('r809DataTreino').value;}),h=$('r809DataHora').value;
      if(!opt||!horaOk(h))throw new Error("Escolha o treino e confira o horário.");
      var ls=lista(ds[d]).slice();if(ls.length>=10)throw new Error("Use até 10 atividades por data.");
      if(ls.some(function(p){return p.tp===opt.tp&&p.id===opt.id&&(p.h||"")===h;}))throw new Error("Esse treino já está programado nesse horário.");
      ls.push({tp:opt.tp,id:opt.id,h:h});ds[d]=ls;
    }else if(acao.indexOf('del:')===0){var rows=lista(ds[d]).slice();rows.splice(+acao.slice(4),1);ds[d]=rows;}else if(acao==='rest'){if(lista(ds[d]).length&&!confirm("Substituir os treinos dessa data por descanso?"))return;ds[d]=[];}
    else {if(!confirm("Remover a exceção desta data e voltar à semana recorrente?"))return;delete ds[d];}
    if(!st.treinosV2)st.treinosV2={};st.treinosV2[id]=t;t.plano=t.plano||{dias:{}};t.plano.datas=ds;
    grava(st,id,true);dataBase=JSON.stringify(ds[d]);calendario();$('r809DataStatus').textContent="Salvo no painel. Publique o planejamento para atualizar o app do aluno.";
  }catch(e){msg('r809DataStatus',e);}}
  api.plano=calendario;

  function bsForm(){try{return blocos(JSON.parse($('cbBlocos').value||'[]'));}catch(e){return [];}}
  function bsDraw(){if(!$('r809BlocosLista'))return;var bs=bsForm();$('r809BlocosLista').innerHTML=bs.map(function(b,i){return '<div class="r809-row"><p>'+esc(blocoTxt(b))+'</p><button type="button" data-r809-block="'+i+'">Remover</button></div>';}).join("")||'<p>Sem blocos: o treino simples acima continua valendo.</p>';}
  var corridaAluno="",corridaConta="";
  function zonasDraw(){
    if(!ctx||!$('r809Corrida'))return;var id=$('cbAluno').value,st=ctx.load(),zs=tDe(st,id).zonasCorrida||[];$('r809Corrida').hidden=!id;
    if(id!==corridaAluno||ctx.conta()!==corridaConta){corridaAluno=id;corridaConta=ctx.conta();['r809ZonaNome','r809ZonaMin','r809ZonaMax','r809AlvoValor','r809RecValor'].forEach(function(k){$(k).value='';});$('r809CorridaStatus').textContent='';}
    ['r809ZonaAlvo','r809ZonaRec'].forEach(function(k){var s=$(k),v=s.value;s.innerHTML='<option value="">Sem zona definida</option>'+zs.map(function(z){return '<option value="'+esc(z.id)+'">'+esc(zonaTxt(z))+'</option>';}).join("");s.value=v;});
    $('r809ZonasLista').innerHTML=zs.map(function(z){return '<div class="r809-row"><span>'+esc(zonaTxt(z))+'</span><button type="button" data-r809-zone="'+esc(z.id)+'">Remover zona</button></div>';}).join("")||'<p>Nenhuma zona cadastrada para este aluno.</p>';
    bsDraw();
  }
  api.corrida=zonasDraw;
  api.init=function(c){
    if(ctx)return;ctx=c;
    document.addEventListener('click',function(e){var b=e.target.closest('[data-edita-pagamento]');if(b){e.preventDefault();pagamento(b.getAttribute('data-edita-pagamento'));}});
    var ds=document.createElement('section');ds.id='r809Datas';ds.className='r809-card';
    ds.innerHTML='<h3>Planejamento por data</h3><p>Opcional: dias específicos substituem a semana recorrente. Um dia de descanso pode ser programado sem apagar a semana.</p><div class="r809-grid"><label>Data<input type="date" id="r809Data"></label><label>Treino deste aluno<select id="r809DataTreino"></select></label><label>Horário (opcional)<input type="time" id="r809DataHora"></label></div><div class="r809-actions"><button type="button" id="r809DataAdd">Adicionar treino à data</button><button type="button" id="r809DataRest">Programar descanso</button><button type="button" id="r809DataReset">Voltar à semana recorrente</button></div><p id="r809DataStatus" role="status"></p><div id="r809DataLista"></div>';
    $('plnDias').parentElement.appendChild(ds);
    $('r809Data').onchange=dataSelecionada;
    $('r809DataAdd').onclick=function(){mudaData('add');};$('r809DataRest').onclick=function(){mudaData('rest');};$('r809DataReset').onclick=function(){mudaData('reset');};
    $('r809DataLista').onclick=function(e){var b=e.target.closest('[data-r809-date]'),del=e.target.closest('[data-r809-del]');if(b){$('r809Data').value=b.dataset.r809Date;dataSelecionada();$('r809Data').focus();}if(del){var v=del.dataset.r809Del.split(':');$('r809Data').value=v[0];dataBase=planoRows[v[0]];mudaData('del:'+v[1]);}};
    var cr=document.createElement('section');cr.id='r809Corrida';cr.className='r809-card';
    function target(prefix,label){return '<fieldset><legend>'+label+'</legend><div class="r809-grid"><label>Duração ou distância<input id="'+prefix+'Valor" type="number" min="0.01" step="any"></label><label>Unidade<select id="'+prefix+'Unidade"><option value="km">km</option><option value="min">minutos</option><option value="s">segundos</option></select></label><label>Zona<select id="'+(prefix==='r809Alvo'?'r809ZonaAlvo':'r809ZonaRec')+'"></select></label></div></fieldset>';}
    cr.innerHTML='<details><summary>Zonas de esforço deste aluno</summary><p>As zonas são definidas pelo profissional. Cada bloco mantém uma cópia da zona usada; remover da biblioteca não muda treinos já prescritos.</p><div class="r809-grid"><label>Nome<input id="r809ZonaNome" maxlength="60"></label><label>Medida<select id="r809ZonaTipo"><option value="pace">Pace (min/km)</option><option value="velocidade">Velocidade (km/h)</option><option value="fc">Frequência cardíaca (bpm)</option></select></label><label>Limite inicial<input id="r809ZonaMin" placeholder="Ex.: 5:00 para pace"></label><label>Limite final<input id="r809ZonaMax" placeholder="Ex.: 6:00 para pace"></label></div><button type="button" id="r809ZonaAdd">Salvar zona</button><div id="r809ZonasLista"></div></details><details><summary>Estrutura por blocos (opcional)</summary><p>Ao adicionar blocos, eles substituem o treino simples acima, inclusive o aquecimento e a recuperação. Salve o treino e depois publique no app.</p><div class="r809-grid"><label>Etapa<select id="r809BlocoTipo"><option value="aquecimento">Aquecimento</option><option value="ativo">Ativo</option><option value="repetir">Repetir esforço e recuperação</option><option value="recuperacao">Recuperação final</option></select></label><label id="r809RepsLabel" hidden>Repetições<input id="r809BlocoReps" type="number" min="1" max="20" value="1"></label></div>'+target('r809Alvo','Etapa ativa')+'<div id="r809RecBox" hidden>'+target('r809Rec','Recuperação entre repetições')+'</div><button type="button" id="r809BlocoAdd">Adicionar bloco ao rascunho</button><div id="r809BlocosLista"></div></details><p id="r809CorridaStatus" role="status"></p>';
    $('cbObs').closest('label').insertAdjacentElement('afterend',cr);
    $('r809BlocoTipo').onchange=function(){var r=this.value==='repetir';$('r809RepsLabel').hidden=!r;$('r809RecBox').hidden=!r;};
    $('r809ZonaAdd').onclick=function(){try{var id=$('cbAluno').value,st=ctx.load();if(!id||!al(st,id))throw new Error('Escolha o aluno.');var z=zona({id:uid(),nome:$('r809ZonaNome').value,tipo:$('r809ZonaTipo').value,min:$('r809ZonaMin').value,max:$('r809ZonaMax').value});st.treinosV2=st.treinosV2||{};var t=st.treinosV2[id]=st.treinosV2[id]||{fichas:[]};t.zonasCorrida=t.zonasCorrida||[];if(t.zonasCorrida.length>=100)throw new Error('Limite de 100 zonas por aluno.');t.zonasCorrida.push(z);if(ctx.save(st)===false)throw new Error('Não foi possível salvar a zona.');zonasDraw();$('r809CorridaStatus').textContent='Zona salva para este aluno. Selecione-a nos blocos.';}catch(e){msg('r809CorridaStatus',e);}};
    $('r809BlocoAdd').onclick=function(){try{var id=$('cbAluno').value,zs=tDe(ctx.load(),id).zonasCorrida||[];if(!id)throw new Error('Escolha o aluno.');function targetRead(p,k){var z=zs.find(function(z){return z.id===$(k).value;});return {valor:$(p+'Valor').value,unidade:$(p+'Unidade').value,zona:z||null};}var b={tipo:$('r809BlocoTipo').value,repeticoes:$('r809BlocoReps').value,alvo:targetRead('r809Alvo','r809ZonaAlvo'),recuperacao:targetRead('r809Rec','r809ZonaRec')};var bs=bsForm();bs.push(b);$('cbBlocos').value=JSON.stringify(blocos(bs));bsDraw();$('r809CorridaStatus').textContent='Bloco adicionado ao rascunho. Clique em Salvar treino para aplicar.';}catch(e){msg('r809CorridaStatus',e);}};
    $('r809BlocosLista').onclick=function(e){var b=e.target.closest('[data-r809-block]');if(b){var bs=bsForm();bs.splice(+b.dataset.r809Block,1);$('cbBlocos').value=JSON.stringify(bs);bsDraw();}};
    $('r809ZonasLista').onclick=function(e){var b=e.target.closest('[data-r809-zone]');if(!b||!confirm('Remover a zona da biblioteca? Os treinos já prescritos serão preservados.'))return;try{var st=ctx.load(),t=tDe(st,$('cbAluno').value);t.zonasCorrida=(t.zonasCorrida||[]).filter(function(z){return z.id!==b.dataset.r809Zone;});if(ctx.save(st)===false)throw new Error('Não foi possível remover.');zonasDraw();}catch(e2){msg('r809CorridaStatus',e2);}};
    calendario();zonasDraw();
  };
})(typeof self!=="undefined"?self:globalThis);
