/* Onboarding da consultoria: modelo compartilhado pelo painel e pelo app do aluno.
 * O painel monta apenas os dados; o runtime abaixo viaja serializado no builder.
 * Não depende do DOM do Personal e não altera questionários/check-ins existentes. */
(function (raiz) {
  "use strict";

  var CONTRATO_PADRAO = [
    "CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONSULTORIA FITNESS",
    "",
    "CONTRATANTE: {{aluno_nome}}, {{aluno_nacionalidade}}, {{aluno_estado_civil}}, {{aluno_profissao}}, RG {{aluno_rg}} ({{aluno_rg_orgao}}), CPF {{aluno_cpf}}, nascido(a) em {{aluno_nascimento}}, residente em {{aluno_endereco}}, e-mail {{aluno_email}} e telefone {{aluno_telefone}}.",
    "",
    "{{representante_legal}}",
    "",
    "CONTRATADO(A): {{prestador_nome}}, CPF/CNPJ {{prestador_documento}}, com endereço em {{prestador_endereco}}, e-mail {{prestador_email}} e telefone {{prestador_telefone}}.",
    "",
    "1. OBJETO. O presente contrato tem por objeto a prestação de consultoria de treinamento físico, conforme o plano {{plano_nome}}, com orientações individualizadas, acompanhamento e ajustes compatíveis com as informações fornecidas pelo CONTRATANTE.",
    "",
    "2. VIGÊNCIA E VALOR. O serviço inicia em {{contrato_inicio}}. O valor contratado é {{plano_valor}}, pago na forma combinada entre as partes. Renovação, prazo e reajustes seguem o plano comercial informado antes do aceite.",
    "",
    "3. RESPONSABILIDADES DO CONTRATADO. Elaborar e acompanhar a prescrição com diligência profissional, explicar a execução proposta, respeitar os limites informados e manter canal de comunicação para dúvidas relacionadas ao serviço.",
    "",
    "4. RESPONSABILIDADES DO CONTRATANTE. Informar com exatidão seu histórico, condições de saúde, dores, lesões, medicamentos e alterações relevantes; seguir as orientações recebidas; interromper a atividade e procurar atendimento adequado diante de sinais de alerta.",
    "",
    "5. SAÚDE E RESULTADOS. A consultoria não substitui avaliação, diagnóstico ou tratamento médico e não garante resultado específico, pois a evolução depende também de frequência, execução, alimentação, sono e condições individuais.",
    "",
    "6. CANCELAMENTO E REMARCAÇÃO. Cancelamentos, pausas, faltas, remarcações e eventual reembolso obedecem às condições comerciais apresentadas pelo CONTRATADO e à legislação aplicável ao consumidor.",
    "",
    "7. DADOS PESSOAIS. Os dados cadastrais e as respostas do questionário serão usados para executar e acompanhar a consultoria, manter registros do serviço e cumprir obrigações legais. Dados de saúde recebem acesso restrito e não serão usados para finalidade incompatível sem base legal adequada.",
    "",
    "8. COMUNICAÇÕES E ACEITE ELETRÔNICO. As partes admitem este aceite eletrônico como manifestação de vontade. O sistema registra a versão lida, data e hora, identificação do aluno e evidências técnicas de integridade do documento.",
    "",
    "9. DISPOSIÇÕES FINAIS. Qualquer alteração material será apresentada em nova versão para aceite. Fica assegurado ao consumidor o conhecimento prévio do conteúdo e os direitos previstos na legislação aplicável.",
    "",
    "Local de referência: {{foro_cidade}}."
  ].join("\n");

  function texto(v, max) { return String(v == null ? "" : v).trim().slice(0, max || 1000); }
  function soDigitos(v) { return texto(v, 40).replace(/\D/g, ""); }
  function estavel(v) {
    if (Array.isArray(v)) return v.map(estavel);
    if (!v || typeof v !== "object") return v;
    var o = {};
    Object.keys(v).sort().forEach(function (k) { if (v[k] !== undefined) o[k] = estavel(v[k]); });
    return o;
  }
  function hash(v) {
    var s = JSON.stringify(estavel(v)), h1 = 2166136261, h2 = 2246822507;
    for (var i = 0; i < s.length; i++) {
      h1 ^= s.charCodeAt(i); h1 = Math.imul(h1, 16777619);
      h2 ^= s.charCodeAt(i); h2 = Math.imul(h2, 3266489917);
    }
    return ("00000000" + (h1 >>> 0).toString(16)).slice(-8) + ("00000000" + (h2 >>> 0).toString(16)).slice(-8);
  }
  function cpfValido(valor) {
    var c = soDigitos(valor);
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    function dv(tam) { var soma = 0; for (var i = 0; i < tam; i++) soma += +c[i] * ((tam + 1) - i); var n = 11 - (soma % 11); return n > 9 ? 0 : n; }
    return dv(9) === +c[9] && dv(10) === +c[10];
  }
  function perguntasDo(st, id) {
    var q = (st.questionarios || []).find(function (x) { return x.id === id; });
    if (!q) return [];
    return (q.perguntas || []).map(function (pid) {
      var p = (st.questPerguntas || []).find(function (x) { return x.id === pid; });
      if (!p) return null;
      return {
        id: texto(p.id, 100), titulo: texto(p.titulo || p.sigla, 80), texto: texto(p.texto, 500),
        tipo: p.tipo === "emoji" || p.tipo === "linear" ? p.tipo : "texto",
        ops: (p.ops || []).slice(0, 12).map(function (o) { return { e: texto(o.e, 8), r: texto(o.r, 100), p: isFinite(+o.p) ? +o.p : 0 }; }),
        obrigatoria: true
      };
    }).filter(Boolean).slice(0, 30);
  }
  function normalizaConfig(st) {
    var c = ((st.config || {}).onboardingConsultoria || {}), p = c.prestador || {};
    return {
      ativo: !!c.ativo,
      titulo: texto(c.titulo || "Antes de começar", 100),
      introducao: texto(c.introducao || "Responda algumas perguntas para o seu personal conhecer você e preparar a consultoria.", 600),
      questionarioId: texto(c.questionarioId, 100),
      contratoAtivo: !!c.contratoAtivo,
      modoAssinatura: c.modoAssinatura === "assinatura" ? "assinatura" : "aceite",
      contratoTitulo: texto(c.contratoTitulo || "Contrato de consultoria", 120),
      contratoTexto: texto(c.contratoTexto || CONTRATO_PADRAO, 20000),
      prestador: {
        nome: texto(p.nome || (st.config || {}).nome, 160), documento: texto(p.documento, 30),
        endereco: texto(p.endereco, 400), email: texto(p.email, 160), telefone: texto(p.telefone, 30),
        cidade: texto(p.cidade, 100), uf: texto(p.uf, 2).toUpperCase()
      }
    };
  }
  function pacote(st, aluno, comercio) {
    var c = normalizaConfig(st), vinculo = aluno && aluno.onboardingConsultoria;
    if (!c.ativo || !vinculo || vinculo.requerido !== true) return null;
    var ps = perguntasDo(st, c.questionarioId), ct = comercio && comercio.contrato, pl = comercio && comercio.plano;
    if (!ps.length && !c.contratoAtivo) return null;
    var base = {
      titulo: c.titulo, introducao: c.introducao, perguntas: ps,
      contrato: {
        ativo: c.contratoAtivo, modo: c.modoAssinatura, titulo: c.contratoTitulo, texto: c.contratoTexto,
        prestador: c.prestador,
        plano: { nome: texto((pl || {}).nome || (aluno || {}).plano || "consultoria", 120), valor: +((pl || {}).valor || (aluno || {}).valor || 0), inicio: texto((ct || {}).inicio || (aluno || {}).desde, 10) }
      },
      aluno: {
        nome: texto((aluno || {}).nome, 160), cpf: texto((aluno || {}).cpf, 30), nascimento: texto((aluno || {}).nasc, 10),
        email: texto((aluno || {}).email, 160), telefone: texto((aluno || {}).zap, 30), cep: texto((aluno || {}).cep, 12),
        endereco: texto((aluno || {}).endereco, 400)
      },
      revisao: texto(vinculo.revisao || "1", 80)
    };
    base.v = "oc-" + hash(base);
    base.ativo = true;
    return base;
  }
  function resolveContrato(modelo, dados, cfg) {
    var d = dados || {}, con = (cfg || {}).contrato || {}, p = con.prestador || {}, pl = con.plano || {};
    var end = [d.logradouro, d.numero, d.complemento, d.bairro, d.cidade && d.uf ? d.cidade + "/" + d.uf : d.cidade || d.uf, d.cep && "CEP " + d.cep].filter(Boolean).join(", ");
    var data = /^\d{4}-\d{2}-\d{2}$/.test(d.nascimento || "") ? d.nascimento.slice(8,10)+"/"+d.nascimento.slice(5,7)+"/"+d.nascimento.slice(0,4) : d.nascimento;
    var valor = +pl.valor ? "R$ " + (+pl.valor).toFixed(2).replace(".", ",") : "conforme combinado";
    var rep = d.responsavelNome ? "REPRESENTANTE LEGAL DO CONTRATANTE: " + d.responsavelNome + ", CPF " + (d.responsavelCpf || "—") + ", que aceita e assina este instrumento em nome do menor." : "";
    var temRep = String(modelo || "").indexOf("{{representante_legal}}") >= 0;
    var mapa = {
      aluno_nome: d.nome, aluno_nacionalidade: d.nacionalidade, aluno_estado_civil: d.estadoCivil,
      aluno_profissao: d.profissao, aluno_rg: d.rg, aluno_rg_orgao: d.rgOrgao,
      aluno_cpf: d.cpf, aluno_nascimento: data, aluno_endereco: end,
      aluno_email: d.email, aluno_telefone: d.telefone, prestador_nome: p.nome,
      prestador_documento: p.documento, prestador_endereco: p.endereco, prestador_email: p.email, prestador_telefone: p.telefone,
      plano_nome: pl.nome || "consultoria", plano_valor: valor,
      contrato_inicio: pl.inicio ? pl.inicio.split("-").reverse().join("/") : "a data do aceite", foro_cidade: p.cidade && p.uf ? p.cidade + "/" + p.uf : p.cidade || "cidade do contratante",
      responsavel_nome:d.responsavelNome, responsavel_cpf:d.responsavelCpf, representante_legal:rep
    };
    var pronto=String(modelo || "").replace(/\{\{([a-z_]+)\}\}/g, function (_, k) { return texto(Object.prototype.hasOwnProperty.call(mapa,k) ? mapa[k] : "—", 500); });
    return !temRep && rep ? pronto + "\n\n" + rep : pronto;
  }

  /* Runtime serializado no app. Dependências vêm no objeto api para que o
   * comportamento possa ser testado sem rede e sem acessar dados do painel. */
  function runtime(cfg, api) {
    if (!cfg || !cfg.ativo || !cfg.v || !api) return;
    var sh = 2166136261, tk = String(api.token || "");
    for (var si = 0; si < tk.length; si++) { sh ^= tk.charCodeAt(si); sh = Math.imul(sh, 16777619); }
    var escopo = (sh >>> 0).toString(36), K = "ptonbconsult:" + escopo, Q = "ptonbconsultfila:" + escopo, estado = api.load(K, null);
    function salva(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
    function tira(k) { try { localStorage.removeItem(k); } catch (e) {} }
    function escapeHtml(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
    function digits(v) { return String(v || "").replace(/\D/g, ""); }
    function cpfOk(v) {
      var c = digits(v); if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
      function dv(n) { var s = 0; for (var i = 0; i < n; i++) s += +c[i] * ((n + 1) - i); var x = 11 - s % 11; return x > 9 ? 0 : x; }
      return dv(9) === +c[9] && dv(10) === +c[10];
    }
    function idade(nasc) { if (!/^\d{4}-\d{2}-\d{2}$/.test(nasc || "")) return -1; var h = new Date(), n = new Date(nasc + "T12:00:00"), a = h.getFullYear() - n.getFullYear(); if ((h.getMonth() * 100 + h.getDate()) < (n.getMonth() * 100 + n.getDate())) a--; return a; }
    function resolve(modelo, d) {
      var c = cfg.contrato || {}, p = c.prestador || {}, pl = c.plano || {};
      var en = [d.logradouro, d.numero, d.complemento, d.bairro, d.cidade && d.uf ? d.cidade + "/" + d.uf : d.cidade || d.uf, d.cep && "CEP " + d.cep].filter(Boolean).join(", ");
      var data=/^\d{4}-\d{2}-\d{2}$/.test(d.nascimento||"")?d.nascimento.slice(8,10)+"/"+d.nascimento.slice(5,7)+"/"+d.nascimento.slice(0,4):d.nascimento;
      var rep=d.responsavelNome?"REPRESENTANTE LEGAL DO CONTRATANTE: "+d.responsavelNome+", CPF "+(d.responsavelCpf||"—")+", que aceita e assina este instrumento em nome do menor.":"",temRep=String(modelo||"").indexOf("{{representante_legal}}")>=0;
      var m = { aluno_nome:d.nome, aluno_nacionalidade:d.nacionalidade, aluno_estado_civil:d.estadoCivil, aluno_profissao:d.profissao, aluno_rg:d.rg, aluno_rg_orgao:d.rgOrgao,
        aluno_cpf:d.cpf, aluno_nascimento:data, aluno_endereco:en, aluno_email:d.email, aluno_telefone:d.telefone,
        prestador_nome:p.nome, prestador_documento:p.documento, prestador_endereco:p.endereco, prestador_email:p.email, prestador_telefone:p.telefone, plano_nome:pl.nome || "consultoria",
        plano_valor:+pl.valor ? "R$ "+(+pl.valor).toFixed(2).replace(".",",") : "conforme combinado", contrato_inicio:pl.inicio ? pl.inicio.split("-").reverse().join("/") : "a data do aceite", foro_cidade:p.cidade && p.uf ? p.cidade + "/" + p.uf : p.cidade || "cidade do contratante", responsavel_nome:d.responsavelNome,responsavel_cpf:d.responsavelCpf,representante_legal:rep };
      var pronto=String(modelo || "").replace(/\{\{([a-z_]+)\}\}/g,function(_,k){return String(Object.prototype.hasOwnProperty.call(m,k)?m[k]:"—");});return !temRep&&rep?pronto+"\n\n"+rep:pronto;
    }
    function termoDepois() { setTimeout(function () { if (window.__abreTermoResponsabilidade) window.__abreTermoResponsabilidade(); }, 80); }
    function concluido(s) { return s && s.v === cfg.v && s.status === "enviado"; }
    function rpc(nome, corpo) { return api.rpc(nome, corpo).catch(function () { return { __rede:true }; }); }
    function enviaFila() {
      var fila = api.load(Q, null); if (!fila || fila.v !== cfg.v) return Promise.resolve({ ok:false, tipo:"sem_fila" });
      if (!api.online()) return Promise.resolve({ ok:false, tipo:"rede" });
      return rpc("app_consultoria_conclui", { t: api.token, p_versao: cfg.v, p_respostas: fila.respostas, p_dados: fila.dados, p_assinatura: fila.assinatura, p_cliente: { agente: navigator.userAgent.slice(0, 300), idioma: navigator.language || "pt-BR" } }).then(function (r) {
        if (!r || r.__rede) return { ok:false, tipo:"rede" };
        if (!r.ok) return { ok:false, tipo:"servidor", erro:String(r.erro || "conteudo_recusado") };
        var s = { v: cfg.v, status: "enviado", em: r.aceito_em || fila.localEm, hash: r.documento_hash || "", id: r.id || "" };
        salva(K, s); tira(Q); estado = s; return { ok:true, dados:r };
      });
    }
    window.addEventListener("online", function(){enviaFila().then(function(r){if(r&&r.ok&&document.getElementById("ocOverlay"))mostraSucesso();});});
    window.__onboardingConsultoria = { versao: cfg.v, pendente: function () { return !!api.load(Q, null); }, reenviar: enviaFila };
    if (concluido(estado)) { enviaFila(); termoDepois(); return; }

    var css = document.createElement("style"); css.id = "ocCss"; css.textContent =
      "#ocOverlay{position:fixed;inset:0;z-index:150;background:var(--bg,#0d0c10);color:#f2f0f6;overflow:auto;font-family:inherit}"+
      "#ocOverlay *{box-sizing:border-box}#ocOverlay .oc-wrap{width:min(100%,520px);min-height:100%;margin:auto;padding:calc(22px + env(safe-area-inset-top,0px)) 20px calc(24px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column}"+
      "#ocOverlay .oc-mark{font-size:10px;letter-spacing:.23em;text-transform:uppercase;color:var(--corc,#c4b5fd);font-weight:900}#ocOverlay h1{font-size:29px;line-height:1.08;margin:8px 0 8px;letter-spacing:-.025em}#ocOverlay .oc-sub{color:#a9a4b5;line-height:1.5;font-size:14px;margin:0}"+
      "#ocOverlay .oc-progress{display:flex;gap:5px;margin:22px 0 24px}#ocOverlay .oc-progress i{height:4px;flex:1;background:#26222f;border-radius:9px}#ocOverlay .oc-progress i.on{background:var(--cor,#7c3aed)}"+
      "#ocOverlay .oc-body{flex:1}#ocOverlay .oc-card{background:#141218;border:1px solid #26222f;border-radius:18px;padding:18px}#ocOverlay .oc-q{font-size:22px;font-weight:850;line-height:1.22;margin:0 0 18px}"+
      "#ocOverlay label{display:block;font-size:12px;font-weight:800;color:#cfcbdb;margin:12px 0 5px}#ocOverlay input,#ocOverlay textarea{width:100%;min-height:48px;border-radius:12px;border:1px solid #322e3d;background:#121016;color:#f2f0f6;padding:11px 13px;font:inherit}#ocOverlay textarea{min-height:100px;resize:vertical}"+
      "#ocOverlay .oc-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}#ocOverlay .oc-full{grid-column:1/-1}#ocOverlay .oc-ops{display:grid;gap:9px}#ocOverlay .oc-op{min-height:52px;border-radius:13px;border:1px solid #322e3d;background:#18151f;color:#f2f0f6;font:inherit;font-weight:750;padding:10px 13px;text-align:left}#ocOverlay .oc-op.on{border-color:var(--cor,#7c3aed);background:rgba(124,58,237,.18)}"+
      "#ocOverlay .oc-scale{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}#ocOverlay .oc-scale button{min-height:44px;border-radius:10px;border:1px solid #322e3d;background:#18151f;color:#f2f0f6;font-weight:800}#ocOverlay .oc-scale button.on{background:var(--cor,#7c3aed);border-color:var(--cor,#7c3aed)}"+
      "#ocOverlay .oc-doc{white-space:pre-wrap;line-height:1.65;font-size:13px;max-height:43vh;overflow:auto;background:#0f0d13;border:1px solid #26222f;border-radius:13px;padding:14px}#ocOverlay .oc-check{display:flex;gap:10px;align-items:flex-start;margin:14px 0;color:#cfcbdb;font-size:13px;line-height:1.45}#ocOverlay .oc-check input{width:20px;min-height:20px;margin:0;flex:none}"+
      "#ocOverlay .oc-sign{width:100%;height:150px;background:#fff;border-radius:12px;touch-action:none;display:block}#ocOverlay .oc-actions{display:flex;gap:10px;margin-top:20px}#ocOverlay .oc-btn{min-height:52px;border:0;border-radius:13px;padding:12px 18px;font:inherit;font-weight:850;cursor:pointer}#ocOverlay .oc-btn.pri{background:var(--cor,#7c3aed);color:#fff}#ocOverlay .oc-actions .oc-btn.pri{flex:1}#ocOverlay .oc-btn.sec{background:#1d1a24;color:#cfcbdb}#ocOverlay .oc-btn:disabled{opacity:.45}#ocOverlay .oc-erro{color:#fca5a5;font-size:13px;line-height:1.4;margin-top:12px}"+
      "@media(max-width:430px){#ocOverlay .oc-wrap{padding-left:16px;padding-right:16px}#ocOverlay .oc-grid{grid-template-columns:1fr}#ocOverlay .oc-full{grid-column:auto}#ocOverlay h1{font-size:27px}}";
    document.head.appendChild(css);
    var ov = document.createElement("div"); ov.id = "ocOverlay"; ov.setAttribute("role", "dialog"); ov.setAttribute("aria-modal", "true"); ov.setAttribute("aria-labelledby","ocTituloEtapa"); document.body.appendChild(ov);
    var scrollHtml=document.documentElement.style.overflow,scrollBody=document.body.style.overflow,bloqueados=[];document.documentElement.style.overflow="hidden";document.body.style.overflow="hidden";
    [].forEach.call(document.body.children,function(el){if(el===ov||el.tagName==="SCRIPT"||el.tagName==="STYLE")return;bloqueados.push({el:el,inert:!!el.inert,aria:el.getAttribute("aria-hidden")});el.inert=true;el.setAttribute("aria-hidden","true");});
    function fechaOverlay(){bloqueados.forEach(function(x){x.el.inert=x.inert;if(x.aria==null)x.el.removeAttribute("aria-hidden");else x.el.setAttribute("aria-hidden",x.aria);});document.documentElement.style.overflow=scrollHtml;document.body.style.overflow=scrollBody;if(ov.parentNode)ov.remove();}
    ov.addEventListener("keydown",function(e){if(e.key!=="Tab")return;var fs=[].filter.call(ov.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'),function(x){return !x.hidden&&x.offsetParent!==null;});if(!fs.length){e.preventDefault();return;}var a=fs[0],z=fs[fs.length-1];if(e.shiftKey&&document.activeElement===a){e.preventDefault();z.focus();}else if(!e.shiftKey&&document.activeElement===z){e.preventDefault();a.focus();}});
    var salvoFila=api.load(Q,null), respostas=salvoFila&&salvoFila.v===cfg.v&&salvoFila.respostas?Object.fromEntries(salvoFila.respostas.map(function(r){return[r.id,r];})): {}, dados = {
      nome:(cfg.aluno||{}).nome||"", nacionalidade:"Brasileiro(a)", estadoCivil:"", profissao:"", rg:"", rgOrgao:"", cpf:(cfg.aluno||{}).cpf||"", nascimento:(cfg.aluno||{}).nascimento||"", email:(cfg.aluno||{}).email||"", telefone:(cfg.aluno||{}).telefone||"", cep:(cfg.aluno||{}).cep||"", logradouro:(cfg.aluno||{}).endereco||"", numero:"", complemento:"", bairro:"", cidade:"", uf:"", responsavelNome:"", responsavelCpf:""
    }, assinatura = { aceitou:false, nome:"", imagem:"" }, passo = 0, ps = cfg.perguntas || [], temContrato = !!(cfg.contrato && cfg.contrato.ativo), total = 1 + ps.length + (temContrato ? 3 : 1), canvas = null, desenhou = false;
    if(salvoFila&&salvoFila.v===cfg.v){if(salvoFila.dados&&typeof salvoFila.dados==="object")dados=Object.assign(dados,salvoFila.dados);if(salvoFila.assinatura&&typeof salvoFila.assinatura==="object")assinatura=Object.assign(assinatura,salvoFila.assinatura);desenhou=/^data:image\/png;base64,/.test(assinatura.imagem||"");passo=total-1;}
    function barra() { var h="<div class='oc-progress'>"; for(var i=0;i<total;i++) h+="<i class='"+(i<=passo?'on':'')+"'></i>"; return h+"</div>"; }
    function campo(id, rot, tipo, cls, extra) { var m=String(extra||"").match(/data-dado='([^']+)'/),v=m&&dados?dados[m[1]]||"":"";return "<label class='"+(cls||"")+"' for='"+id+"'>"+rot+"</label><input class='"+(cls||"")+"' id='"+id+"' type='"+(tipo||"text")+"' value='"+escapeHtml(v)+"' "+(extra||"")+">"; }
    function cab() { return "<div class='oc-mark'>INÍCIO DA CONSULTORIA</div><h1 id='ocTituloEtapa' tabindex='-1'>"+escapeHtml(cfg.titulo||"Antes de começar")+"</h1>"+barra(); }
    function erro(msg, id) { var e=document.getElementById("ocErro"); if(e)e.textContent=msg||""; if(id){var x=document.getElementById(id);if(x){x.focus();x.scrollIntoView({block:"center"});}} return false; }
    function guardaCampos() { document.querySelectorAll("#ocOverlay [data-dado]").forEach(function(x){dados[x.dataset.dado]=String(x.value||"").trim();}); var na=document.getElementById("ocAssNome");if(na)assinatura.nome=na.value.trim();if(canvas&&desenhou)assinatura.imagem=canvas.toDataURL("image/png"); }
    function canon(v){return String(v||"").trim().replace(/\s+/g," ").toLocaleLowerCase("pt-BR");}
    function nascOk(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||"")||v<"1900-01-01"||v>new Date().toISOString().slice(0,10))return false;var d=new Date(v+"T12:00:00Z");return !isNaN(d)&&d.toISOString().slice(0,10)===v;}
    function normalizaEnvio(){var d=Object.assign({},dados);Object.keys(d).forEach(function(k){if(typeof d[k]==="string")d[k]=d[k].trim();});d.cpf=digits(d.cpf);d.responsavelCpf=digits(d.responsavelCpf);d.cep=digits(d.cep);d.telefone=digits(d.telefone);d.uf=String(d.uf||"").toUpperCase();if(idade(d.nascimento)>=18){d.responsavelNome="";d.responsavelCpf="";}return d;}
    function validaAtual() {
      guardaCampos();
      if(passo>=1&&passo<=ps.length){var p=ps[passo-1],r=respostas[p.id];if(!r||!String(r.resposta||"").trim())return erro("Responda esta pergunta para continuar.",p.tipo==="texto"?"ocTexto":null);}
      if(temContrato&&passo===ps.length+1){
        var req=[["nome","nome completo","ocNome"],["nacionalidade","nacionalidade","ocNacionalidade"],["estadoCivil","estado civil","ocEstadoCivil"],["profissao","profissão","ocProfissao"],["rg","RG","ocRg"],["rgOrgao","órgão expedidor do RG","ocRgOrgao"],["cpf","CPF","ocCpf"],["nascimento","data de nascimento","ocNasc"],["email","e-mail","ocEmail"],["telefone","telefone","ocTelefone"],["cep","CEP","ocCep"],["logradouro","logradouro","ocRua"],["numero","número","ocNumero"],["bairro","bairro","ocBairro"],["cidade","cidade","ocCidade"],["uf","UF","ocUf"]];
        for(var i=0;i<req.length;i++)if(!dados[req[i][0]])return erro("Preencha "+req[i][1]+".",req[i][2]);
        if(dados.nome.length<3)return erro("Informe o nome completo.","ocNome");if(dados.nacionalidade.length<3)return erro("Informe a nacionalidade.","ocNacionalidade");if(dados.estadoCivil.length<3)return erro("Informe o estado civil.","ocEstadoCivil");if(dados.profissao.length<2)return erro("Informe a profissão.","ocProfissao");if(dados.rg.length<3)return erro("Confira o RG.","ocRg");if(dados.rgOrgao.length<2)return erro("Confira o órgão expedidor.","ocRgOrgao");
        if(!cpfOk(dados.cpf))return erro("Confira o CPF informado.","ocCpf");if(!nascOk(dados.nascimento))return erro("Confira a data de nascimento.","ocNasc");if(!/^\S+@\S+\.\S+$/.test(dados.email))return erro("Confira o e-mail informado.","ocEmail");if(digits(dados.telefone).length<10)return erro("Informe o telefone com DDD.","ocTelefone");if(digits(dados.cep).length!==8)return erro("Informe o CEP com 8 números.","ocCep");if(dados.logradouro.length<3)return erro("Informe o logradouro completo.","ocRua");if(!dados.numero)return erro("Informe o número.","ocNumero");if(dados.bairro.length<2)return erro("Informe o bairro.","ocBairro");if(dados.cidade.length<2)return erro("Informe a cidade.","ocCidade");if(!/^[A-Za-z]{2}$/.test(dados.uf))return erro("Informe a UF com 2 letras.","ocUf");
        if(idade(dados.nascimento)<18){if(dados.responsavelNome.length<3)return erro("Informe o nome completo do responsável legal.","ocRespNome");if(!cpfOk(dados.responsavelCpf))return erro("Confira o CPF do responsável legal.","ocRespCpf");}
        dados=normalizaEnvio();
      }
      if(temContrato&&passo===ps.length+2){var lg=document.getElementById("ocLgpd");if(ps.length&&(!lg||!lg.checked))return erro("Confirme a autorização destacada para usar as respostas na consultoria.","ocLgpd");var ac=document.getElementById("ocAceite");if(!ac||!ac.checked)return erro("Marque que leu e aceita o contrato.","ocAceite");assinatura.aceitou=true;assinatura.consentimentoSaude=!ps.length||lg.checked;}
      if(temContrato&&passo===ps.length+3){var esperado=idade(dados.nascimento)<18?dados.responsavelNome:dados.nome;if(assinatura.nome.length<3)return erro("Digite o nome completo de quem está assinando.","ocAssNome");if(canon(assinatura.nome)!==canon(esperado))return erro("Use o mesmo nome completo informado nos dados do contrato.","ocAssNome");if((cfg.contrato||{}).modo==="assinatura"&&!desenhou)return erro("Faça a assinatura no quadro branco.","ocCanvas");}
      if(!temContrato&&passo===ps.length+1){var cs=document.getElementById("ocConsentimento");if(!cs||!cs.checked)return erro("Confirme a autorização para enviar as respostas ao seu personal.","ocConsentimento");assinatura.consentimentoSaude=true;}
      return true;
    }
    function pinta() {
      var corpo="", titulo="";
      if(passo===0){titulo="Vamos preparar sua consultoria";corpo="<div class='oc-card'><p class='oc-q'>"+escapeHtml(cfg.introducao||"")+"</p><p class='oc-sub'>São "+ps.length+" pergunta(s)"+(temContrato?" e a conferência do contrato":"")+". Você pode revisar antes de enviar.</p></div>";}
      else if(passo<=ps.length){var p=ps[passo-1],r=respostas[p.id]||{};titulo="Pergunta "+passo+" de "+ps.length;corpo="<div class='oc-card'><p class='oc-q'>"+escapeHtml(p.texto)+"</p>";
        if(p.tipo==="emoji")corpo+="<div class='oc-ops'>"+(p.ops||[]).map(function(o,i){return "<button class='oc-op "+(r.indice===i?"on":"")+"' data-op='"+i+"'><span style='font-size:22px;margin-right:9px'>"+escapeHtml(o.e)+"</span>"+escapeHtml(o.r)+"</button>";}).join("")+"</div>";
        else if(p.tipo==="linear"){corpo+="<div class='oc-scale'>";for(var n=0;n<=10;n++)corpo+="<button class='"+(String(r.resposta)===String(n)?"on":"")+"' data-nota='"+n+"'>"+n+"</button>";corpo+="</div>";}
        else corpo+="<textarea id='ocTexto' maxlength='1000' placeholder='Escreva sua resposta'>"+escapeHtml(r.resposta||"")+"</textarea>";corpo+="</div>";}
      else if(temContrato&&passo===ps.length+1){titulo="Confira seus dados";var menor=idade(dados.nascimento)>=0&&idade(dados.nascimento)<18;corpo="<div class='oc-card'><p class='oc-sub'>Esses dados identificam você no contrato. Complete o que faltar.</p><div class='oc-grid'>"+
        campo("ocNome","Nome completo","text","oc-full","data-dado='nome' autocomplete='name'")+campo("ocNacionalidade","Nacionalidade","text","","data-dado='nacionalidade'")+campo("ocEstadoCivil","Estado civil","text","","data-dado='estadoCivil'")+campo("ocProfissao","Profissão","text","oc-full","data-dado='profissao'")+campo("ocRg","RG","text","","data-dado='rg'")+campo("ocRgOrgao","Órgão expedidor","text","","data-dado='rgOrgao'")+campo("ocCpf","CPF","text","","data-dado='cpf' inputmode='numeric'")+campo("ocNasc","Nascimento","date","","data-dado='nascimento' autocomplete='bday'")+campo("ocEmail","E-mail","email","oc-full","data-dado='email' autocomplete='email'")+campo("ocTelefone","Telefone com DDD","tel","","data-dado='telefone' autocomplete='tel'")+campo("ocCep","CEP","text","","data-dado='cep' inputmode='numeric' autocomplete='postal-code'")+campo("ocRua","Logradouro","text","oc-full","data-dado='logradouro' autocomplete='street-address'")+campo("ocNumero","Número","text","","data-dado='numero'")+campo("ocComplemento","Complemento (opcional)","text","","data-dado='complemento'")+campo("ocBairro","Bairro","text","","data-dado='bairro'")+campo("ocCidade","Cidade","text","","data-dado='cidade'")+campo("ocUf","UF","text","","data-dado='uf' maxlength='2'")+"</div><div id='ocMenor' "+(menor?"":"hidden")+"><hr style='border:0;border-top:1px solid #26222f;margin:18px 0'><p class='oc-sub'>Como o aluno é menor de 18 anos, o responsável legal também assina.</p><div class='oc-grid'>"+campo("ocRespNome","Nome do responsável","text","","data-dado='responsavelNome'")+campo("ocRespCpf","CPF do responsável","text","","data-dado='responsavelCpf' inputmode='numeric'")+"</div></div></div>";}
      else if(temContrato&&passo===ps.length+2){titulo="Leia o contrato";corpo="<div class='oc-card'><div class='oc-doc' id='ocDocumento'>"+escapeHtml(resolve(cfg.contrato.texto,dados))+"</div>"+(ps.length?"<label class='oc-check'><input id='ocLgpd' type='checkbox'>Autorizo, de forma livre, informada e destacada, o uso das minhas respostas e dos dados de saúde para personalizar e acompanhar esta consultoria.</label>":"")+"<label class='oc-check'><input id='ocAceite' type='checkbox'>Li o contrato completo, tive oportunidade de esclarecer dúvidas e aceito esta versão.</label></div>";}
      else if(temContrato){titulo="Assinar e enviar";var nomeEsperado=idade(dados.nascimento)<18?dados.responsavelNome:dados.nome;corpo="<div class='oc-card'><p class='oc-sub'>Digite o nome completo de "+(idade(dados.nascimento)<18?"quem responde legalmente pelo aluno":"quem aceita o contrato")+".</p><label for='ocAssNome'>Nome completo</label><input id='ocAssNome' maxlength='160' autocomplete='name' value='"+escapeHtml(assinatura.nome||nomeEsperado||"")+"'>"+((cfg.contrato||{}).modo==="assinatura"?"<label>Assinatura no quadro</label><canvas class='oc-sign' id='ocCanvas' tabindex='0' aria-label='Quadro para assinatura'></canvas><button class='oc-btn sec' id='ocLimpa' type='button' style='margin-top:8px'>Limpar assinatura</button>":"<p class='oc-sub' style='margin-top:14px'>O aceite eletrônico será vinculado ao seu nome, à versão lida e à data registrada pelo servidor.</p>")+"</div>";}
      else{titulo="Autorizar e enviar";corpo="<div class='oc-card'><p class='oc-q'>Tudo pronto para enviar</p><label class='oc-check'><input id='ocConsentimento' type='checkbox'>Autorizo, de forma livre, informada e destacada, o uso das minhas respostas e dos dados de saúde para personalizar e acompanhar esta consultoria.</label><p class='oc-sub'>Seu personal verá apenas as respostas deste cadastro.</p></div>";}
      ov.innerHTML="<div class='oc-wrap'>"+cab()+"<div class='oc-mark' style='letter-spacing:.14em;margin-bottom:8px'>"+escapeHtml(titulo)+"</div><div class='oc-body'>"+corpo+"<div id='ocErro' class='oc-erro' role='alert'></div></div><div class='oc-actions'>"+(passo>0?"<button class='oc-btn sec' id='ocVolta'>Voltar</button>":"")+"<button class='oc-btn pri' id='ocProx'>"+(passo===total-1?(temContrato?"Aceitar e concluir":"Enviar respostas"):temContrato&&passo===total-2?"Ir para assinatura":"Continuar")+"</button></div></div>";
      function repoeDados(){document.querySelectorAll("#ocOverlay [data-dado]").forEach(function(x){x.value=dados[x.dataset.dado]||"";});}
      repoeDados();document.querySelectorAll("#ocOverlay [data-dado]").forEach(function(x){x.addEventListener("input",function(){dados[x.dataset.dado]=x.value;if(x.id==="ocNasc"){var m=document.getElementById("ocMenor");if(m)m.hidden=!(idade(x.value)>=0&&idade(x.value)<18);}});});
      var txt=document.getElementById("ocTexto");if(txt)txt.addEventListener("input",function(){respostas[ps[passo-1].id]={id:ps[passo-1].id,pergunta:ps[passo-1].texto,resposta:txt.value.slice(0,1000),pontos:null};});
      document.querySelectorAll("[data-op]").forEach(function(b){b.onclick=function(){var p=ps[passo-1],o=(p.ops||[])[+b.dataset.op]||{};respostas[p.id]={id:p.id,pergunta:p.texto,resposta:o.r||o.e||"",pontos:+o.p||0,indice:+b.dataset.op};pinta();};});
      document.querySelectorAll("[data-nota]").forEach(function(b){b.onclick=function(){var p=ps[passo-1];respostas[p.id]={id:p.id,pergunta:p.texto,resposta:b.dataset.nota,pontos:+b.dataset.nota};pinta();};});
      var v=document.getElementById("ocVolta");if(v)v.onclick=function(){guardaCampos();passo--;pinta();};
      document.getElementById("ocProx").onclick=function(){if(!validaAtual())return;if(passo<total-1){passo++;pinta();}else finalizar();};
      if(document.getElementById("ocCanvas"))ligaCanvas();
      requestAnimationFrame(function(){if(passo===ps.length+1&&temContrato)repoeDados();var h=document.getElementById("ocTituloEtapa");if(h)h.focus({preventScroll:true});});
    }
    function ligaCanvas(){canvas=document.getElementById("ocCanvas");var ctx=canvas.getContext("2d"),r=canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.max(300,Math.round(r.width*dpr));canvas.height=Math.round(150*dpr);ctx.scale(dpr,dpr);ctx.strokeStyle="#17121f";ctx.lineWidth=2.2;ctx.lineCap="round";var down=false;if(/^data:image\/png;base64,/.test(assinatura.imagem||"")){var im=new Image();im.onload=function(){ctx.drawImage(im,0,0,r.width,150);desenhou=true;};im.src=assinatura.imagem;}
      function pos(e){var q=canvas.getBoundingClientRect(),p=e.touches?e.touches[0]:e;return{x:p.clientX-q.left,y:p.clientY-q.top};}function ini(e){down=true;var p=pos(e);ctx.beginPath();ctx.moveTo(p.x,p.y);e.preventDefault();}function mov(e){if(!down)return;var p=pos(e);ctx.lineTo(p.x,p.y);ctx.stroke();desenhou=true;e.preventDefault();}function fim(){down=false;}canvas.addEventListener("pointerdown",ini);canvas.addEventListener("pointermove",mov);addEventListener("pointerup",fim);var l=document.getElementById("ocLimpa");if(l)l.onclick=function(){ctx.clearRect(0,0,canvas.width,canvas.height);assinatura.imagem="";desenhou=false;};}
    function mensagemServidor(c){var m={respostas_invalidas:"As respostas mudaram. Volte e confira o questionário.",resposta_obrigatoria:"Volte e responda todas as perguntas.",dados_contratuais_incompletos:"Volte e confira todos os dados do contrato.",cpf_invalido:"Volte e confira o CPF.",nascimento_invalido:"Volte e confira a data de nascimento.",responsavel_legal_necessario:"Volte e confira o responsável legal.",aceite_necessario:"O nome de quem assina deve ser igual ao nome completo informado no contrato.",assinatura_necessaria:"Refaça a assinatura no quadro.",assinatura_invalida:"Refaça a assinatura no quadro.",documento_divergente:"O contrato foi atualizado. Volte, leia novamente e confirme a versão atual.",onboarding_desatualizado:"O personal atualizou esta entrada. Reabra o app para responder a versão nova.",contrato_incompleto:"O contrato precisa ser corrigido pelo personal antes do envio."};return m[c]||"O servidor não aceitou este envio. Confira os dados ou peça ao personal para revisar a configuração.";}
    function mostraSucesso(){ov.innerHTML="<div class='oc-wrap' style='justify-content:center;text-align:center'><div style='width:76px;height:76px;border-radius:50%;background:rgba(74,222,128,.14);color:#4ade80;display:grid;place-items:center;font-size:36px;margin:0 auto 18px'>✓</div><h1 id='ocTituloEtapa' tabindex='-1'>Cadastro concluído</h1><p class='oc-sub'>Seu personal já recebeu suas respostas"+(temContrato?" e o contrato assinado":"")+".</p><button class='oc-btn pri' id='ocEntrar' style='margin-top:24px'>Entrar no meu app</button></div>";document.getElementById("ocEntrar").onclick=function(){fechaOverlay();termoDepois();};document.getElementById("ocEntrar").focus();}
    function finalizar(){var bt=document.getElementById("ocProx");bt.disabled=true;bt.textContent="Enviando…";if(canvas&&desenhou)assinatura.imagem=canvas.toDataURL("image/png");dados=normalizaEnvio();assinatura.nome=String(assinatura.nome||"").trim().slice(0,160);assinatura.aceitou=true;assinatura.consentimentoSaude=!ps.length||assinatura.consentimentoSaude;assinatura.documento=temContrato?resolve(cfg.contrato.texto,dados):"";var lista=ps.map(function(p){var r=respostas[p.id]||{};return{id:p.id,pergunta:p.texto,resposta:String(r.resposta||"").slice(0,1000),pontos:r.pontos==null?null:+r.pontos};});var fila={v:cfg.v,respostas:lista,dados:dados,assinatura:assinatura,localEm:new Date().toISOString()};if(!salva(Q,fila)||!salva(K,{v:cfg.v,status:"pendente",em:fila.localEm})){bt.disabled=false;bt.textContent="Aceitar e concluir";return erro("O aparelho está sem espaço para guardar o contrato. Libere espaço e tente de novo.");}estado={v:cfg.v,status:"pendente",em:fila.localEm};enviaFila().then(function(r){if(r&&r.ok){mostraSucesso();return;}bt=document.getElementById("ocProx");if(bt){bt.disabled=false;bt.textContent=temContrato?"Aceitar e concluir":"Enviar respostas";}if(r&&r.tipo==="servidor")erro(mensagemServidor(r.erro));else erro("Sem conexão para concluir agora. O preenchimento ficou protegido neste aparelho; conecte-se e toque em enviar novamente.");});}
    function inicia(){var ant=document.getElementById("termoOv");if(ant)ant.remove();pinta();}
    if(api.online())rpc("app_consultoria_estado",{t:api.token,p_versao:cfg.v}).then(function(r){if(r&&r.ok&&r.concluido){estado={v:cfg.v,status:"enviado",em:r.aceito_em||"",hash:r.documento_hash||"",id:r.id||""};salva(K,estado);fechaOverlay();termoDepois();}else inicia();});else inicia();
  }

  raiz.MT_ONBOARDING_CONSULTORIA = {
    CONTRATO_PADRAO: CONTRATO_PADRAO, hash: hash, cpfValido: cpfValido,
    perguntasDo: perguntasDo, normalizaConfig: normalizaConfig, pacote: pacote,
    resolveContrato: resolveContrato, runtime: runtime
  };
})(typeof self !== "undefined" ? self : this);
