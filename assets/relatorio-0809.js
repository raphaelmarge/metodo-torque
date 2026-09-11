/* TORQUE PERSONAL — fechamento do relatório de 08/09/2026.
 * Extensão compatível com o produto atual. Grava somente via MTStore para
 * manter CAS, auditoria e sincronização existentes.
 */
(function () {
  "use strict";
  if (typeof document === "undefined" || window.MT_RELATORIO_0809) return;
  window.MT_RELATORIO_0809 = { versao: 2 };

  function norm(v){return String(v==null?"":v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");}
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c];});}
  function uid(){return "r809"+Date.now().toString(36)+Math.random().toString(36).slice(2,8);}
  function hoje(){var d=new Date(),z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10);}
  function brl(v){return Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});}
  function S(){return window.MTStore&&typeof MTStore.read==="function"&&typeof MTStore.write==="function"?window.MTStore:null;}
  function read(){var s=S();return s?(s.read("ptStudio",{})||{}):{};}
  function save(st){var s=S();return !!(s&&s.write("ptStudio",st)!==false);}
  function aluno(st,id){return(st.alunos||[]).find(function(a){return String(a.id)===String(id);})||null;}
  function mod(a){return norm(a&&(a.modalidade||a.modo));}
  function onlineOnly(a){var m=mod(a);return(m==="online"||m.indexOf("consultoria")>=0||m.indexOf("on-line")>=0)&&m.indexOf("hibr")<0&&m.indexOf("presencial")<0;}
  function pacoteAtivo(a){var p=a&&a.pacote;return !!(p&&Number(p.total||0)>Number(p.usadas||0));}
  function contratosAtivos(st,id){return(st.contratosPT||[]).filter(function(c){var x=norm(c.status);return String(c.alunoId||c.aluno)===String(id)&&x!=="encerrado"&&x!=="cancelado";});}

  function carregaCss(){if(document.getElementById("mt-r809-css"))return;var l=document.createElement("link");l.id="mt-r809-css";l.rel="stylesheet";l.href=(location.pathname.indexOf("/app/")>=0?"../":"")+"assets/relatorio-0809.css?v="+(window.MT_VERSAO||"1");document.head.appendChild(l);}
  carregaCss();

  /* Pacote pré-pago com sessões restantes e SEM contrato mensal ativo não é
   * dívida mensal. O wrapper mantém o formato original de dividaDe(). */
  function wrapDivida(){
    if(typeof window.dividaDe!=="function"||window.dividaDe.__r809)return;
    var orig=window.dividaDe;
    var fn=function(){
      var r=orig.apply(this,arguments), st=null, a=null;
      Array.prototype.forEach.call(arguments,function(x){if(!x||typeof x!=="object")return;if(Array.isArray(x.alunos)&&Array.isArray(x.pagamentos))st=x;else if(x.id&&x.pacote)a=x;});
      if(!st)st=read();
      if(!a&&arguments.length){var id=typeof arguments[0]==="string"?arguments[0]:null;if(id)a=aluno(st,id);}
      if(a&&pacoteAtivo(a)&&!contratosAtivos(st,a.id).length){
        if(r&&typeof r==="object")return Object.assign({},r,{total:0,aberto:0});
        if(typeof r==="number")return 0;
      }
      return r;
    };fn.__r809=true;window.dividaDe=fn;
  }

  var perfilId="";
  function financeiroRoot(){var hs=Array.from(document.querySelectorAll("h1,h2,h3,h4"));var h=hs.find(function(x){return norm(x.textContent)==="financeiro"&&x.offsetParent!==null;});return h?(h.closest(".card")||h.parentElement):null;}
  function perfilRoot(){return document.querySelector("main")||document.getElementById("vAlunos")||document.body;}

  function corrigeStatus(root,st,a){
    if(!root||!a||!pacoteAtivo(a)||contratosAtivos(st,a.id).length)return;
    Array.from(root.querySelectorAll("*" )).forEach(function(el){if(el.children.length)return;var t=(el.textContent||"").trim();if(/situa[cç][aã]o acumulada\s*:\s*devendo/i.test(t)){el.textContent="Situação: pacote ativo · "+Math.max(0,Number(a.pacote.total||0)-Number(a.pacote.usadas||0))+" sessão(ões) disponível(is)";el.classList.add("mt-r809-ok");}});
  }

  function abrePagamento(id,pid){
    var st=read(),p=(st.pagamentos||[]).find(function(x){return String(x.id)===String(pid);});if(!p)return;
    var modal=document.createElement("div");modal.className="mt-r809-modal";
    modal.innerHTML='<form class="mt-r809-dialog"><h3>Editar recebimento</h3><label>Data<input name="data" type="date" required value="'+esc(p.data||hoje())+'"></label><label>Valor (R$)<input name="valor" type="number" min="0" step="0.01" required value="'+esc(p.valor||0)+'"></label><label>Forma<input name="forma" maxlength="80" value="'+esc(p.forma||"")+'"></label><label>Descrição<input name="desc" maxlength="140" value="'+esc(p.desc||"")+'"></label><div class="mt-r809-actions"><button type="button" class="btn sec" data-cancel>Cancelar</button><button class="btn pri" type="submit">Salvar alteração</button></div><p class="mt-r809-muted">A versão anterior fica registrada na auditoria financeira.</p></form>';
    document.body.appendChild(modal);modal.querySelector("[data-cancel]").onclick=function(){modal.remove();};modal.onclick=function(e){if(e.target===modal)modal.remove();};
    modal.querySelector("form").onsubmit=function(e){e.preventDefault();var fresh=read(),i=(fresh.pagamentos||[]).findIndex(function(x){return String(x.id)===String(pid);});if(i<0)return;var before=JSON.parse(JSON.stringify(fresh.pagamentos[i])),fd=new FormData(e.currentTarget),v=Number(fd.get("valor"));if(!isFinite(v)||v<0){alert("Confira o valor do recebimento.");return;}fresh.pagamentos[i]=Object.assign({},fresh.pagamentos[i],{data:String(fd.get("data")||hoje()),valor:v,forma:String(fd.get("forma")||"").trim(),desc:String(fd.get("desc")||"").trim(),editadoEm:new Date().toISOString()});fresh.pagamentosAuditoria=Array.isArray(fresh.pagamentosAuditoria)?fresh.pagamentosAuditoria:[];fresh.pagamentosAuditoria.push({id:uid(),pagamentoId:pid,alunoId:id,em:new Date().toISOString(),antes:before,depois:JSON.parse(JSON.stringify(fresh.pagamentos[i]))});fresh.pagamentosAuditoria=fresh.pagamentosAuditoria.slice(-1000);if(!save(fresh)){alert("Existe uma alteração mais nova. Reabra o aluno antes de tentar de novo.");return;}modal.remove();setTimeout(enhancePerfil,40);};
  }

  function renderPagamentos(root,id){
    if(!root)return;var old=document.getElementById("mt-r809-pagamentos");if(old)old.remove();var st=read(),a=aluno(st,id);if(!a)return;corrigeStatus(root,st,a);
    var ps=(st.pagamentos||[]).filter(function(p){return String(p.alunoId||p.aluno)===String(id);}).slice().sort(function(x,y){return String(y.data||"").localeCompare(String(x.data||""));});
    var box=document.createElement("section");box.id="mt-r809-pagamentos";box.className="mt-r809-card";box.innerHTML='<div class="mt-r809-title"><div><b>Recebimentos</b><small>Você pode corrigir data, valor, forma e descrição sem apagar o histórico.</small></div></div><div class="mt-r809-list"></div>';
    var list=box.querySelector(".mt-r809-list");if(!ps.length)list.innerHTML='<p class="mt-r809-muted">Nenhum recebimento lançado.</p>';
    ps.forEach(function(p){var r=document.createElement("div");r.className="mt-r809-pay";r.innerHTML='<div><b>'+esc(p.data||"—")+' · '+esc(brl(p.valor))+'</b><small>'+esc(p.desc||p.forma||"Recebimento")+'</small></div><button type="button" class="btn sec">Editar</button>';r.querySelector("button").onclick=function(){abrePagamento(id,p.id);};list.appendChild(r);});root.appendChild(box);
  }

  function bloqueiaPresencial(a){var on=onlineOnly(a);Array.from(document.querySelectorAll("button,a")).forEach(function(el){var t=norm(el.textContent);if(t==="agendar"||t.indexOf("sessao presencial")>=0||t.indexOf("aula presencial")>=0){if(on){if(!el.hasAttribute("data-r809-display"))el.setAttribute("data-r809-display",el.style.display||"");el.style.display="none";}else if(el.hasAttribute("data-r809-display")){el.style.display=el.getAttribute("data-r809-display");el.removeAttribute("data-r809-display");}}});}

  function renderModalidade(id){
    var root=perfilRoot(),old=document.getElementById("mt-r809-modalidade");if(old&&old.dataset.aluno!==String(id))old.remove();if(document.getElementById("mt-r809-modalidade"))return;
    var st=read(),a=aluno(st,id);if(!a)return;var m=mod(a),atual=m.indexOf("hibr")>=0?"híbrido":((m.indexOf("consultoria")>=0||m==="online")?"consultoria online":"presencial");
    var box=document.createElement("section");box.id="mt-r809-modalidade";box.dataset.aluno=String(id);box.className="mt-r809-card";box.innerHTML='<div class="mt-r809-title"><div><b>Tipo de atendimento</b><small>Define se este aluno usa agenda presencial.</small></div></div><select aria-label="Tipo de atendimento"><option value="presencial">Personal presencial</option><option value="consultoria online">Consultoria online</option><option value="híbrido">Híbrido</option></select><p class="mt-r809-muted"></p>';
    var sel=box.querySelector("select"),msg=box.querySelector("p");sel.value=atual;function txt(){msg.textContent=sel.value==="consultoria online"?"Exclusivamente online: sessões e pedidos presenciais ficam bloqueados.":sel.value==="híbrido"?"Híbrido: mantém agenda presencial e consultoria.":"Presencial: agenda presencial disponível.";}txt();sel.onchange=function(){var fresh=read(),aa=aluno(fresh,id);if(!aa)return;aa.modalidade=sel.value;if(save(fresh)){txt();bloqueiaPresencial(aa);}else alert("Existe uma alteração mais nova. Reabra o aluno.");};root.appendChild(box);bloqueiaPresencial(a);
  }

  function semanaRoot(){var h=Array.from(document.querySelectorAll("h1,h2,h3,h4")).find(function(x){return /semana do aluno/i.test(x.textContent||"")&&x.offsetParent!==null;});return h?(h.closest(".card")||h.parentElement):null;}
  function treinoOpts(st){var out=[];Object.keys(st.treinosV2||{}).forEach(function(k){var t=st.treinosV2[k];out.push({id:k,nome:t&&typeof t==="object"&&!Array.isArray(t)?(t.nome||t.titulo||k):k});});(st.treinos||[]).forEach(function(t){if(t&&t.id&&!out.some(function(x){return x.id===t.id;}))out.push({id:t.id,nome:t.nome||t.titulo||t.id});});return out;}
  function renderMensal(root,id){
    if(!root)return;var old=document.getElementById("mt-r809-mensal");if(old)old.remove();var st=read(),opts=treinoOpts(st),box=document.createElement("section");box.id="mt-r809-mensal";box.className="mt-r809-card";box.innerHTML='<div class="mt-r809-title"><div><b>Planejamento por data</b><small>Opcional: a semana recorrente continua valendo nos dias sem programação específica.</small></div></div><div class="mt-r809-grid"><label>Data<input type="date" data-date></label><label>Treino<select data-treino><option value="">Escolha um treino</option></select></label><button type="button" class="btn pri" data-add>Adicionar data</button></div><div data-list></div>';
    var sel=box.querySelector("[data-treino]");opts.forEach(function(x){var o=document.createElement("option");o.value=x.id;o.textContent=x.nome;sel.appendChild(o);});
    function draw(){var s=read(),rows=((s.programacaoDatas||{})[id]||[]).slice().sort(function(a,b){return String(a.data).localeCompare(String(b.data));}),list=box.querySelector("[data-list]");list.innerHTML=rows.length?"":'<p class="mt-r809-muted">Sem datas específicas: segue a programação semanal.</p>';rows.forEach(function(x){var n=(opts.find(function(o){return o.id===x.treinoId;})||{}).nome||x.treinoId,r=document.createElement("div");r.className="mt-r809-date";r.innerHTML='<span><b>'+esc(x.data)+'</b><small>'+esc(n)+'</small></span><button type="button" class="btn sec">Remover</button>';r.querySelector("button").onclick=function(){var f=read();f.programacaoDatas=f.programacaoDatas||{};f.programacaoDatas[id]=(f.programacaoDatas[id]||[]).filter(function(y){return y.id!==x.id;});if(save(f))draw();};list.appendChild(r);});}
    box.querySelector("[data-add]").onclick=function(){var d=box.querySelector("[data-date]").value,t=sel.value;if(!d||!t){alert("Escolha a data e o treino.");return;}var f=read();f.programacaoDatas=f.programacaoDatas||{};var l=Array.isArray(f.programacaoDatas[id])?f.programacaoDatas[id]:[];l=l.filter(function(x){return x.data!==d;});l.push({id:uid(),data:d,treinoId:t});f.programacaoDatas[id]=l;if(save(f)){box.querySelector("[data-date]").value="";draw();}};root.appendChild(box);draw();
  }

  function renderZonas(root){
    if(!root||document.getElementById("mt-r809-zonas"))return;var box=document.createElement("section");box.id="mt-r809-zonas";box.className="mt-r809-card";box.innerHTML='<div class="mt-r809-title"><div><b>Zonas de esforço da corrida</b><small>Nomeie e reutilize zonas por pace, velocidade ou frequência cardíaca.</small></div></div><div class="mt-r809-zoneform"><input data-nome placeholder="Ex.: Limiar"><select data-tipo><option value="pace">Pace (min/km)</option><option value="velocidade">Velocidade (km/h)</option><option value="fc">Frequência cardíaca (bpm)</option></select><input data-min placeholder="Mínimo"><input data-max placeholder="Máximo"><button type="button" class="btn pri" data-add>Adicionar zona</button></div><div data-list></div>';
    function draw(){var st=read(),zs=Array.isArray(st.zonasCorrida)?st.zonasCorrida:[],list=box.querySelector("[data-list]");list.innerHTML=zs.length?"":'<p class="mt-r809-muted">Ex.: Z1, Z2, Maratona, Limiar, Repetição.</p>';zs.forEach(function(z){var r=document.createElement("div");r.className="mt-r809-date";r.innerHTML='<span><b>'+esc(z.nome)+'</b><small>'+esc(z.tipo)+': '+esc(z.min)+' – '+esc(z.max)+'</small></span><button type="button" class="btn sec">Excluir</button>';r.querySelector("button").onclick=function(){var s=read();s.zonasCorrida=(s.zonasCorrida||[]).filter(function(x){return x.id!==z.id;});if(save(s)){draw();injetaZonaSelects();}};list.appendChild(r);});}
    box.querySelector("[data-add]").onclick=function(){var n=box.querySelector("[data-nome]").value.trim(),t=box.querySelector("[data-tipo]").value,mi=box.querySelector("[data-min]").value.trim(),ma=box.querySelector("[data-max]").value.trim();if(!n||!mi||!ma){alert("Preencha nome, mínimo e máximo.");return;}var s=read();s.zonasCorrida=Array.isArray(s.zonasCorrida)?s.zonasCorrida:[];s.zonasCorrida.push({id:uid(),nome:n,tipo:t,min:mi,max:ma});if(save(s)){box.querySelector("[data-nome]").value="";box.querySelector("[data-min]").value="";box.querySelector("[data-max]").value="";draw();injetaZonaSelects();}};root.appendChild(box);draw();
  }

  function injetaZonaSelects(){var zs=Array.isArray(read().zonasCorrida)?read().zonasCorrida:[];if(!zs.length)return;Array.from(document.querySelectorAll("input,select")).forEach(function(el){var k=norm(el.placeholder||el.getAttribute("aria-label")||"");if(!/(pace|ritmo|velocidade|frequencia cardiaca)/.test(k))return;var p=el.closest("label,.campo,.field")||el.parentElement;if(!p||p.querySelector(".mt-r809-zonepick"))return;var s=document.createElement("select");s.className="mt-r809-zonepick";s.innerHTML='<option value="">Usar zona de esforço…</option>';zs.forEach(function(z){var o=document.createElement("option");o.value=z.id;o.textContent=z.nome+" · "+z.tipo+" "+z.min+"–"+z.max;s.appendChild(o);});s.onchange=function(){var z=zs.find(function(x){return x.id===s.value;});if(!z)return;el.value=z.min+"–"+z.max;el.dataset.zonaId=z.id;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};p.appendChild(s);});}

  function achaAlunoNosArgs(args,st){var found=null;Array.prototype.forEach.call(args,function(x){if(found||!x||typeof x!=="object")return;if(x.id&&aluno(st,x.id))found=x;});return found;}
  function wrapDadosApp(){
    if(typeof window.dadosAppAluno!=="function"||window.dadosAppAluno.__r809)return;
    var orig=window.dadosAppAluno;var fn=function(){var st=read(),d=orig.apply(this,arguments),a=achaAlunoNosArgs(arguments,st),id=a&&a.id;if(d&&typeof d==="object"&&id){d.programacaoDatas=((st.programacaoDatas||{})[id]||[]).slice();d.zonasCorrida=(st.zonasCorrida||[]).slice();d.modalidade=a.modalidade||a.modo||"";}return d;};fn.__r809=true;window.dadosAppAluno=fn;
  }

  function enhancePerfil(){if(!perfilId)return;wrapDivida();wrapDadosApp();var st=read(),a=aluno(st,perfilId);if(!a)return;var fin=financeiroRoot();if(fin)renderPagamentos(fin,perfilId);renderModalidade(perfilId);bloqueiaPresencial(a);var sem=semanaRoot();if(sem){renderMensal(sem,perfilId);renderZonas(sem);}injetaZonaSelects();}
  function wrapPerfil(){if(typeof window.__perfilPT!=="function"||window.__perfilPT.__r809)return false;var orig=window.__perfilPT;var fn=function(id){perfilId=String(id||"");var r=orig.apply(this,arguments);setTimeout(enhancePerfil,80);setTimeout(enhancePerfil,350);return r;};fn.__r809=true;window.__perfilPT=fn;return true;}

  function pacoteLocal(){try{var p=JSON.parse(localStorage.getItem("tq_app_pacote")||"null");return p&&p.dados?p.dados:p;}catch(e){return null;}}
  function alunoApp(){
    if(location.pathname.indexOf("/app/")<0)return;document.documentElement.classList.add("mt-r809-aluno");
    function bloqueia(){var d=window.D||window.dadosApp||window.APP_DADOS||pacoteLocal()||{},m=norm(d.modalidade||(d.a&&d.a.modalidade));if((m.indexOf("consultoria")>=0||m==="online")&&m.indexOf("hibr")<0){Array.from(document.querySelectorAll("button,a")).forEach(function(el){var t=norm(el.textContent);if(t.indexOf("pedir aula")>=0||t.indexOf("agendar aula")>=0||t.indexOf("sessao presencial")>=0)el.hidden=true;});}}
    bloqueia();new MutationObserver(bloqueia).observe(document.body,{childList:true,subtree:true});
  }

  function boot(){
    alunoApp();if(location.pathname.indexOf("personal")<0&&!document.getElementById("vAlunos"))return;
    wrapDivida();wrapDadosApp();wrapPerfil();injetaZonaSelects();
    var n=0,t=setInterval(function(){wrapDivida();wrapDadosApp();wrapPerfil();injetaZonaSelects();if(++n>=24)clearInterval(t);},250);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();