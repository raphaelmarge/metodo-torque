/* TORQUE PERSONAL — fechamento do relatório de 08/09/2026.
 * Camada pequena e compatível com o Personal atual. Não substitui o builder.
 * Usa MTStore para preservar CAS, auditoria e sincronização já existentes.
 */
(function () {
  "use strict";
  if (typeof document === "undefined" || window.MT_RELATORIO_0809) return;
  window.MT_RELATORIO_0809 = { versao: 1 };

  function norm(v) { return String(v == null ? "" : v).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
  function uid() { return "r809" + Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function brl(v) { return Number(v || 0).toLocaleString("pt-BR", {style:"currency", currency:"BRL"}); }
  function hoje() { var d=new Date(), z=new Date(d.getTime()-d.getTimezoneOffset()*60000); return z.toISOString().slice(0,10); }
  function store() { return window.MTStore && typeof window.MTStore.read === "function" && typeof window.MTStore.write === "function" ? window.MTStore : null; }
  function read() { var s=store(); return s ? (s.read("ptStudio", {}) || {}) : {}; }
  function save(st) { var s=store(); return !!(s && s.write("ptStudio", st) !== false); }
  function aluno(st,id) { return (st.alunos || []).find(function(a){ return String(a.id)===String(id); }) || null; }
  function modalidade(a) {
    var m=norm(a && a.modalidade);
    if (m) return m;
    return norm(a && a.modo);
  }
  function onlineOnly(a) { var m=modalidade(a); return (m.indexOf("consultoria")>=0 || m==="online" || m.indexOf("on-line")>=0) && m.indexOf("hibr")<0 && m.indexOf("presencial")<0; }
  function pacoteAtivo(a) { var p=a && a.pacote; return !!(p && Number(p.total||0)>Number(p.usadas||0)); }
  function contratosAtivos(st,id) { return (st.contratosPT||[]).filter(function(c){ return String(c.alunoId||c.aluno)===String(id) && norm(c.status)!=="encerrado" && norm(c.status)!=="cancelado"; }); }

  function css() {
    if (document.getElementById("mt-r809-css")) return;
    var l=document.createElement("link"); l.id="mt-r809-css"; l.rel="stylesheet"; l.href="assets/relatorio-0809.css?v="+(window.MT_VERSAO||"1");
    if (location.pathname.indexOf("/app/")>=0) l.href="../assets/relatorio-0809.css?v="+(window.MT_VERSAO||"1");
    document.head.appendChild(l);
  }
  css();

  /* ---------- Perfil / Financeiro ---------- */
  var perfilId="";
  function achaFinanceiro() {
    var roots=Array.from(document.querySelectorAll("h1,h2,h3,h4,.tab,.card,p,div"));
    var h=roots.find(function(el){ return /^financeiro$/i.test((el.textContent||"").trim()) && el.offsetParent!==null; });
    return h ? (h.closest(".card") || h.parentElement) : null;
  }
  function corrigeStatusVisual(root, st, a) {
    if (!root || !a || !pacoteAtivo(a) || contratosAtivos(st,a.id).length) return;
    Array.from(root.querySelectorAll("*" )).forEach(function(el){
      var t=(el.textContent||"").trim();
      if (/situa[cç][aã]o acumulada\s*:\s*devendo/i.test(t) && el.children.length===0) {
        el.textContent="Situação: pacote ativo · "+Math.max(0,Number(a.pacote.total||0)-Number(a.pacote.usadas||0))+" sessão(ões) disponível(is)";
        el.classList.add("mt-r809-ok");
      }
    });
  }
  function renderPagamentos(root,id) {
    if (!root || !id) return;
    var old=document.getElementById("mt-r809-pagamentos"); if (old) old.remove();
    var st=read(), a=aluno(st,id); if (!a) return;
    corrigeStatusVisual(root,st,a);
    var pags=(st.pagamentos||[]).filter(function(p){ return String(p.alunoId||p.aluno)===String(id); }).slice().sort(function(x,y){ return String(y.data||"").localeCompare(String(x.data||"")); });
    var box=document.createElement("section"); box.id="mt-r809-pagamentos"; box.className="mt-r809-card";
    box.innerHTML='<div class="mt-r809-title"><div><b>Recebimentos</b><small>Edite um lançamento sem apagar o histórico da alteração.</small></div></div>'+(pags.length?'<div class="mt-r809-list"></div>':'<p class="mt-r809-muted">Nenhum recebimento lançado para este aluno.</p>');
    var list=box.querySelector(".mt-r809-list");
    pags.forEach(function(p){
      var row=document.createElement("div"); row.className="mt-r809-pay";
      row.innerHTML='<div><b>'+esc(p.data||"—")+' · '+esc(brl(p.valor))+'</b><small>'+esc(p.desc||p.forma||"Recebimento")+'</small></div><button type="button" class="btn sec">Editar</button>';
      row.querySelector("button").onclick=function(){ abrePagamento(id,p.id); };
      list.appendChild(row);
    });
    root.appendChild(box);
  }
  function abrePagamento(id,pid) {
    var st=read(), p=(st.pagamentos||[]).find(function(x){return String(x.id)===String(pid);}); if(!p)return;
    var modal=document.createElement("div"); modal.className="mt-r809-modal";
    modal.innerHTML='<form class="mt-r809-dialog"><h3>Editar recebimento</h3><label>Data<input name="data" type="date" required value="'+esc(p.data||hoje())+'"></label><label>Valor (R$)<input name="valor" type="number" min="0" step="0.01" required value="'+esc(p.valor||0)+'"></label><label>Forma<input name="forma" maxlength="80" value="'+esc(p.forma||"")+'"></label><label>Descrição<input name="desc" maxlength="140" value="'+esc(p.desc||"")+'"></label><div class="mt-r809-actions"><button type="button" class="btn sec" data-cancel>Cancelar</button><button class="btn pri" type="submit">Salvar alteração</button></div><p class="mt-r809-muted">A versão anterior ficará registrada na auditoria financeira.</p></form>';
    document.body.appendChild(modal);
    modal.querySelector("[data-cancel]").onclick=function(){modal.remove();};
    modal.onclick=function(e){if(e.target===modal)modal.remove();};
    modal.querySelector("form").onsubmit=function(e){
      e.preventDefault(); var fresh=read(), idx=(fresh.pagamentos||[]).findIndex(function(x){return String(x.id)===String(pid);}); if(idx<0)return;
      var before=JSON.parse(JSON.stringify(fresh.pagamentos[idx])), fd=new FormData(e.currentTarget), val=Number(fd.get("valor"));
      if(!isFinite(val)||val<0){alert("Confira o valor do recebimento.");return;}
      fresh.pagamentos[idx]=Object.assign({},fresh.pagamentos[idx],{data:String(fd.get("data")||hoje()),valor:val,forma:String(fd.get("forma")||"").trim(),desc:String(fd.get("desc")||"").trim(),editadoEm:new Date().toISOString()});
      fresh.pagamentosAuditoria=Array.isArray(fresh.pagamentosAuditoria)?fresh.pagamentosAuditoria:[];
      fresh.pagamentosAuditoria.push({id:uid(),pagamentoId:pid,alunoId:id,em:new Date().toISOString(),antes:before,depois:JSON.parse(JSON.stringify(fresh.pagamentos[idx]))});
      fresh.pagamentosAuditoria=fresh.pagamentosAuditoria.slice(-1000);
      if(!save(fresh)){alert("Não foi possível salvar porque existe uma alteração mais nova. Reabra o aluno e tente novamente.");return;}
      modal.remove(); setTimeout(function(){renderPagamentos(achaFinanceiro(),id);},30);
    };
  }

  /* ---------- Modalidade presencial / consultoria ---------- */
  function renderModalidade(root,id) {
    if (!root || document.getElementById("mt-r809-modalidade")) return;
    var st=read(), a=aluno(st,id); if(!a)return;
    var box=document.createElement("section"); box.id="mt-r809-modalidade"; box.className="mt-r809-card";
    var m=modalidade(a); var atual=m.indexOf("hibr")>=0?"hibrido":((m.indexOf("consultoria")>=0||m==="online")?"consultoria online":"presencial");
    box.innerHTML='<div class="mt-r809-title"><div><b>Tipo de atendimento</b><small>Controla agenda presencial e pedidos de aula.</small></div></div><select aria-label="Tipo de atendimento"><option value="presencial">Personal presencial</option><option value="consultoria online">Consultoria online</option><option value="híbrido">Híbrido</option></select><p class="mt-r809-muted"></p>';
    var sel=box.querySelector("select"), msg=box.querySelector("p"); sel.value=atual;
    function texto(){msg.textContent=sel.value==="consultoria online"?"Aluno exclusivamente online: sessões e pedidos de aula presencial ficam bloqueados.":sel.value==="híbrido"?"Aluno híbrido: mantém agenda presencial e consultoria.":"Aluno presencial: agenda presencial disponível.";}
    texto(); sel.onchange=function(){ var fresh=read(), aa=aluno(fresh,id); if(!aa)return; aa.modalidade=sel.value; if(save(fresh)){texto(); aplicaBloqueioOnline(aa);} else alert("Não foi possível salvar porque existe uma alteração mais nova."); };
    root.insertBefore(box,root.firstChild&&root.firstChild.nextSibling);
  }
  function aplicaBloqueioOnline(a) {
    var on=onlineOnly(a);
    Array.from(document.querySelectorAll("button,a")).forEach(function(el){
      var t=norm(el.textContent);
      if (t==="agendar" || t.indexOf("sessao presencial")>=0 || t.indexOf("aula presencial")>=0) {
        if(on){ el.dataset.r809Hidden=el.style.display||""; el.style.display="none"; }
        else if(el.dataset.r809Hidden!=null){ el.style.display=el.dataset.r809Hidden; delete el.dataset.r809Hidden; }
      }
    });
  }

  /* ---------- Planejamento semanal / mensal por data ---------- */
  function achaSemana() {
    var h=Array.from(document.querySelectorAll("h1,h2,h3,h4")).find(function(el){return /semana do aluno/i.test(el.textContent||"") && el.offsetParent!==null;});
    return h ? (h.closest(".card")||h.parentElement) : null;
  }
  function treinoOptions(st) {
    var out=[]; Object.keys(st.treinosV2||{}).forEach(function(k){ var t=st.treinosV2[k]; if(Array.isArray(t)) out.push({id:k,nome:k}); else if(t&&typeof t==="object") out.push({id:k,nome:t.nome||t.titulo||k}); });
    (st.treinos||[]).forEach(function(t){ if(t&&t.id&&!out.some(function(x){return x.id===t.id;})) out.push({id:t.id,nome:t.nome||t.titulo||t.id}); }); return out;
  }
  function renderMensal(root,id) {
    if(!root||!id)return; var old=document.getElementById("mt-r809-mensal"); if(old)old.remove();
    var st=read(); st.programacaoDatas=st.programacaoDatas&&typeof st.programacaoDatas==="object"?st.programacaoDatas:{}; var arr=Array.isArray(st.programacaoDatas[id])?st.programacaoDatas[id]:[];
    var box=document.createElement("section"); box.id="mt-r809-mensal"; box.className="mt-r809-card";
    box.innerHTML='<div class="mt-r809-title"><div><b>Planejamento por data</b><small>Opcional. Use a semana recorrente ou programe dias específicos do mês.</small></div></div><div class="mt-r809-grid"><label>Data<input type="date" data-date min="'+hoje()+'"></label><label>Treino<select data-treino><option value="">Escolha um treino</option></select></label><button type="button" class="btn pri" data-add>Adicionar data</button></div><div data-list></div>';
    var opts=treinoOptions(st), sel=box.querySelector("[data-treino]"); opts.forEach(function(x){var o=document.createElement("option");o.value=x.id;o.textContent=x.nome;sel.appendChild(o);});
    function draw(){ var fresh=read(), list=box.querySelector("[data-list]"), rows=((fresh.programacaoDatas||{})[id]||[]).slice().sort(function(a,b){return String(a.data).localeCompare(String(b.data));}); list.innerHTML=rows.length?"":'<p class="mt-r809-muted">Sem exceções por data. A programação semanal continua valendo.</p>'; rows.forEach(function(r){var line=document.createElement("div");line.className="mt-r809-date";var nome=(opts.find(function(x){return x.id===r.treinoId;})||{}).nome||r.treinoId;line.innerHTML='<span><b>'+esc(r.data)+'</b><small>'+esc(nome)+'</small></span><button type="button" class="btn sec">Remover</button>';line.querySelector("button").onclick=function(){var s=read();s.programacaoDatas=s.programacaoDatas||{};s.programacaoDatas[id]=(s.programacaoDatas[id]||[]).filter(function(x){return x.id!==r.id;});if(save(s))draw();};list.appendChild(line);}); }
    box.querySelector("[data-add]").onclick=function(){var d=box.querySelector("[data-date]").value,t=sel.value;if(!d||!t){alert("Escolha a data e o treino.");return;}var s=read();s.programacaoDatas=s.programacaoDatas||{};var l=Array.isArray(s.programacaoDatas[id])?s.programacaoDatas[id]:[];l=l.filter(function(x){return x.data!==d;});l.push({id:uid(),data:d,treinoId:t});s.programacaoDatas[id]=l;if(save(s)){box.querySelector("[data-date]").value="";draw();}};
    root.appendChild(box); draw();
  }

  /* ---------- Zonas de corrida ---------- */
  function renderZonas(root,id) {
    if(!root||document.getElementById("mt-r809-zonas"))return;
    var box=document.createElement("section");box.id="mt-r809-zonas";box.className="mt-r809-card";
    box.innerHTML='<div class="mt-r809-title"><div><b>Zonas de esforço da corrida</b><small>Crie zonas próprias por pace, velocidade ou frequência cardíaca e reutilize na prescrição.</small></div></div><div class="mt-r809-zoneform"><input data-nome placeholder="Ex.: Limiar"><select data-tipo><option value="pace">Pace (min/km)</option><option value="velocidade">Velocidade (km/h)</option><option value="fc">Frequência cardíaca (bpm)</option></select><input data-min placeholder="Mínimo"><input data-max placeholder="Máximo"><button type="button" class="btn pri" data-add>Adicionar zona</button></div><div data-list></div>';
    function draw(){var st=read(),zs=Array.isArray(st.zonasCorrida)?st.zonasCorrida:[],list=box.querySelector("[data-list]");list.innerHTML=zs.length?"":'<p class="mt-r809-muted">Crie Z1, Z2, Maratona, Limiar, Repetição ou qualquer outra zona que usar.</p>';zs.forEach(function(z){var r=document.createElement("div");r.className="mt-r809-date";r.innerHTML='<span><b>'+esc(z.nome)+'</b><small>'+esc(z.tipo)+': '+esc(z.min)+' – '+esc(z.max)+'</small></span><button class="btn sec" type="button">Excluir</button>';r.querySelector("button").onclick=function(){var s=read();s.zonasCorrida=(s.zonasCorrida||[]).filter(function(x){return x.id!==z.id;});if(save(s))draw();};list.appendChild(r);});}
    box.querySelector("[data-add]").onclick=function(){var nome=box.querySelector("[data-nome]").value.trim(),tipo=box.querySelector("[data-tipo]").value,min=box.querySelector("[data-min]").value.trim(),max=box.querySelector("[data-max]").value.trim();if(!nome||!min||!max){alert("Preencha nome, mínimo e máximo da zona.");return;}var s=read();s.zonasCorrida=Array.isArray(s.zonasCorrida)?s.zonasCorrida:[];s.zonasCorrida.push({id:uid(),nome:nome,tipo:tipo,min:min,max:max});if(save(s)){box.querySelector("[data-nome]").value="";box.querySelector("[data-min]").value="";box.querySelector("[data-max]").value="";draw();}};
    root.appendChild(box);draw();
  }
  function injetaSelectZonas() {
    var st=read(), zs=Array.isArray(st.zonasCorrida)?st.zonasCorrida:[]; if(!zs.length)return;
    Array.from(document.querySelectorAll("input,select")).forEach(function(el){
      var ph=norm(el.placeholder||el.getAttribute("aria-label")||""); if(!/(pace|ritmo|frequencia cardiaca|velocidade)/.test(ph))return;
      var parent=el.closest("label,.campo,.field")||el.parentElement; if(!parent||parent.querySelector(".mt-r809-zonepick"))return;
      var s=document.createElement("select");s.className="mt-r809-zonepick";s.innerHTML='<option value="">Usar zona de esforço…</option>';zs.forEach(function(z){var o=document.createElement("option");o.value=z.id;o.textContent=z.nome+" · "+z.tipo+" "+z.min+"–"+z.max;s.appendChild(o);});
      s.onchange=function(){var z=zs.find(function(x){return x.id===s.value;});if(!z)return;el.value=z.min+"–"+z.max;el.dataset.zonaId=z.id;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));}; parent.appendChild(s);
    });
  }

  /* ---------- Publicação: carrega os novos dados no pacote sem quebrar legados ---------- */
  function wrapDadosApp() {
    if(typeof window.dadosAppAluno!=="function" || window.dadosAppAluno.__r809)return;
    var orig=window.dadosAppAluno;
    var fn=function(){var d=orig.apply(this,arguments), id=arguments[0]&&arguments[0].id?arguments[0].id:arguments[0], st=read(); if(d&&typeof d==="object"){d.programacaoDatas=((st.programacaoDatas||{})[id]||[]).slice();d.zonasCorrida=(st.zonasCorrida||[]).slice();var a=aluno(st,id);if(a)d.modalidade=a.modalidade||a.modo||"";}return d;}; fn.__r809=true;window.dadosAppAluno=fn;
  }

  /* ---------- App do aluno ---------- */
  function alunoRuntime() {
    if(location.pathname.indexOf("/app/")<0)return;
    // Contraste: o conteúdo novo não pode ficar branco sobre fundo claro.
    document.documentElement.classList.add("mt-r809-aluno");
    // Camada defensiva: se o pacote expõe a modalidade no DOM/global, não oferece pedido presencial.
    function bloqueia(){var d=window.D||window.dadosApp||window.APP_DADOS||null,m=norm(d&&d.modalidade);if((m.indexOf("consultoria")>=0||m==="online")&&m.indexOf("hibr")<0){Array.from(document.querySelectorAll("button,a")).forEach(function(el){var t=norm(el.textContent);if(t.indexOf("pedir aula")>=0||t.indexOf("agendar aula")>=0||t.indexOf("sessao presencial")>=0)el.hidden=true;});}}
    bloqueia(); new MutationObserver(bloqueia).observe(document.body,{childList:true,subtree:true});
  }

  function enhancePerfil() {
    if(!perfilId)return;var st=read(),a=aluno(st,perfilId);if(!a)return;
    var fin=achaFinanceiro(); if(fin)renderPagamentos(fin,perfilId);
    var root=(fin&&fin.parentElement)||document.querySelector("main")||document.body;renderModalidade(root,perfilId);aplicaBloqueioOnline(a);
    var sem=achaSemana();if(sem){renderMensal(sem,perfilId);renderZonas(sem,perfilId);}injetaSelectZonas();wrapDadosApp();
  }
  function wrapPerfil() {
    if(typeof window.__perfilPT!=="function"||window.__perfilPT.__r809)return false;
    var orig=window.__perfilPT;var fn=function(id){perfilId=String(id||"");var r=orig.apply(this,arguments);setTimeout(enhancePerfil,40);setTimeout(enhancePerfil,250);return r;};fn.__r809=true;window.__perfilPT=fn;return true;
  }
  function boot() {
    alunoRuntime();
    if(location.pathname.indexOf("personal")<0 && !document.getElementById("vAlunos"))return;
    wrapPerfil();wrapDadosApp();injetaSelectZonas();
    var n=0,t=setInterval(function(){wrapPerfil();wrapDadosApp();injetaSelectZonas();if(++n>40)clearInterval(t);},250);
    new MutationObserver(function(){if(perfilId){setTimeout(enhancePerfil,0);}else injetaSelectZonas();}).observe(document.body,{childList:true,subtree:true});
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();