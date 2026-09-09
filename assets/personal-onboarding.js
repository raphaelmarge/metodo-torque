/* Configuração e acompanhamento do onboarding da consultoria.
 * Camada aditiva: lê/grava pelo mesmo ptStudio e publica pelo fluxo canônico. */
(function (raiz) {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return "&#" + c.charCodeAt(0) + ";"; }); }
  function txt(v, n) { return String(v == null ? "" : v).trim().slice(0, n || 1000); }
  function dataBr(v) { var s = String(v || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) : "—"; }
  function moeda(v) { try { return (+v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); } catch (e) { return "R$ " + (+v || 0); } }
  function documentoOk(v) { var d = String(v || "").replace(/\D/g, ""); return d.length === 11 ? raiz.MT_ONBOARDING_CONSULTORIA.cpfValido(d) : d.length === 14; }

  function init(api) {
    var core = raiz.MT_ONBOARDING_CONSULTORIA;
    if (!core || !api || $("ocpConfig")) return;
    var respostasCache = {}, consultaSeq = 0, sujo = false;
    var raizQuest = $("vQuest"), secMontar = raizQuest && raizQuest.querySelector('[data-qtsec="montar"]');
    if (!secMontar) return;

    var card = document.createElement("section");
    card.id = "ocpConfig"; card.className = "card ocp-card";
    card.innerHTML =
      '<div class="ocp-head"><div><h2>Início da consultoria</h2><p class="ocp-help">Defina o que o aluno precisa preencher antes de entrar no app.</p></div><span class="ocp-badge" id="ocpBadge">Desativado</span></div>' +
      '<label class="ocp-switch"><input type="checkbox" id="ocpAtivo"><span><b>Oferecer este onboarding aos novos alunos</b><small>No cadastro de cada aluno você ainda decide se quer exigir ou dispensar.</small></span></label>' +
      '<div id="ocpEditor"><div class="ocp-fields">' +
      '<label class="ocp-field full">Título para o aluno<input id="ocpTitulo" maxlength="100" placeholder="Antes de começar"></label>' +
      '<label class="ocp-field full">Explicação curta<textarea id="ocpIntro" rows="3" maxlength="600"></textarea></label>' +
      '<label class="ocp-field">Questionário inicial<select id="ocpQuestionario"><option value="">Sem questionário</option></select></label>' +
      '<div class="ocp-actions" style="align-self:end"><button type="button" class="btn sec" id="ocpCriarPerguntas">Criar ou editar perguntas</button></div></div>' +
      '<label class="ocp-switch" style="margin-top:12px"><input type="checkbox" id="ocpContrato"><span><b>Incluir contrato no final</b><small>O aluno confere seus dados e aceita a versão completa.</small></span></label>' +
      '<div id="ocpContratoEditor"><div class="ocp-fields" style="margin-top:12px">' +
      '<label class="ocp-field">Forma de aceite<select id="ocpModo"><option value="aceite">Aceite eletrônico + nome</option><option value="assinatura">Aceite + assinatura desenhada</option></select></label>' +
      '<label class="ocp-field">Título do contrato<input id="ocpContratoTitulo" maxlength="120"></label>' +
      '<label class="ocp-field">Nome ou razão social do personal<input id="ocpPrestadorNome" maxlength="160"></label>' +
      '<label class="ocp-field">CPF ou CNPJ<input id="ocpPrestadorDoc" maxlength="30" inputmode="numeric"></label>' +
      '<label class="ocp-field full">Endereço completo do personal<input id="ocpPrestadorEnd" maxlength="400" placeholder="Rua, número, bairro e CEP"></label>' +
      '<label class="ocp-field">Cidade<input id="ocpPrestadorCidade" maxlength="100"></label>' +
      '<label class="ocp-field">UF<input id="ocpPrestadorUf" maxlength="2"></label>' +
      '<label class="ocp-field">E-mail do personal<input id="ocpPrestadorEmail" maxlength="160" type="email"></label>' +
      '<label class="ocp-field">Telefone com DDD<input id="ocpPrestadorTelefone" maxlength="30" type="tel"></label>' +
      '<label class="ocp-field full">Texto do contrato<textarea id="ocpContratoTexto" maxlength="20000"></textarea></label></div>' +
      '<p class="ocp-help">O modelo exige identificação das partes, endereço, objeto, valor, vigência, responsabilidades, cancelamento, dados pessoais e aceite. Personalize as regras comerciais e valide o texto final com seu jurídico.</p>' +
      '<div class="ocp-actions" style="margin-top:10px"><button type="button" class="btn sec" id="ocpModelo">Restaurar contrato padrão</button><button type="button" class="btn sec" id="ocpPrevia">Ver prévia</button></div><div id="ocpPreview" class="ocp-preview" hidden></div></div></div>' +
      '<div class="ocp-actions"><button type="button" class="btn" id="ocpSalvar">Salvar configuração</button><button type="button" class="btn sec" id="ocpDescartar">Descartar alterações</button></div><p class="ocp-status" id="ocpStatus" role="status"></p>';
    secMontar.insertBefore(card, secMontar.firstChild);

    var dlg = document.createElement("dialog"); dlg.id = "ocpDialog"; dlg.className = "ocp-dialog";
    dlg.innerHTML = '<div class="ocp-dialog-inner"><div class="ocp-head"><h2 id="ocpDialogTitulo">Onboarding</h2><button type="button" class="btn sec" id="ocpDialogFecha">Fechar</button></div><div id="ocpDialogCorpo" style="margin-top:14px"></div><div class="ocp-actions" style="margin-top:14px"><button type="button" class="btn" id="ocpImprimir">Imprimir contrato</button></div></div>';
    document.body.appendChild(dlg); $("ocpDialogFecha").onclick = function () { dlg.close(); }; $("ocpImprimir").onclick = imprimirAtual;

    function cfgLida() { return core.normalizaConfig(api.load()); }
    function opcoesQuestionario(valor) {
      var st = api.load(), sel = $("ocpQuestionario"), atual = valor == null ? sel.value : valor;
      sel.innerHTML = '<option value="">Sem questionário</option>' + (st.questionarios || []).map(function (q) { return '<option value="' + esc(q.id) + '">' + esc(q.nome) + " · " + (q.perguntas || []).length + " pergunta(s)</option>"; }).join("");
      sel.value = (st.questionarios || []).some(function (q) { return q.id === atual; }) ? atual : "";
    }
    function pintaCampos() {
      var c = cfgLida(); sujo = false; opcoesQuestionario(c.questionarioId);
      $("ocpAtivo").checked = c.ativo; $("ocpTitulo").value = c.titulo; $("ocpIntro").value = c.introducao;
      $("ocpContrato").checked = c.contratoAtivo; $("ocpModo").value = c.modoAssinatura; $("ocpContratoTitulo").value = c.contratoTitulo;
      $("ocpPrestadorNome").value = c.prestador.nome; $("ocpPrestadorDoc").value = c.prestador.documento; $("ocpPrestadorEnd").value = c.prestador.endereco;
      $("ocpPrestadorEmail").value = c.prestador.email; $("ocpPrestadorTelefone").value = c.prestador.telefone; $("ocpPrestadorCidade").value = c.prestador.cidade; $("ocpPrestadorUf").value = c.prestador.uf;
      $("ocpContratoTexto").value = c.contratoTexto; $("ocpPreview").hidden = true; alterna(); resumo();
    }
    function alterna() {
      $("ocpEditor").hidden = !$("ocpAtivo").checked; $("ocpContratoEditor").hidden = !$("ocpContrato").checked;
    }
    function resumo() {
      var st = api.load(), c = cfgLida(), n = (st.alunos || []).filter(function (a) { return a.onboardingConsultoria && a.onboardingConsultoria.requerido; }).length;
      $("ocpBadge").className = "ocp-badge" + (c.ativo ? " ok" : ""); $("ocpBadge").textContent = c.ativo ? "Ativo · " + n + " aluno(s)" : "Desativado";
      if (!sujo) $("ocpStatus").textContent = c.ativo ? "Configuração pronta. Mudanças entram no app depois da publicação." : "O app continua abrindo normalmente enquanto estiver desativado.";
    }
    function rascunho() {
      return { ativo: $("ocpAtivo").checked, titulo: txt($("ocpTitulo").value, 100), introducao: txt($("ocpIntro").value, 600), questionarioId: $("ocpQuestionario").value,
        contratoAtivo: $("ocpContrato").checked, modoAssinatura: $("ocpModo").value === "assinatura" ? "assinatura" : "aceite", contratoTitulo: txt($("ocpContratoTitulo").value, 120), contratoTexto: txt($("ocpContratoTexto").value, 20000),
        prestador: { nome:txt($("ocpPrestadorNome").value,160), documento:txt($("ocpPrestadorDoc").value,30), endereco:txt($("ocpPrestadorEnd").value,400), email:txt($("ocpPrestadorEmail").value,160), telefone:txt($("ocpPrestadorTelefone").value,30), cidade:txt($("ocpPrestadorCidade").value,100), uf:txt($("ocpPrestadorUf").value,2).toUpperCase() } };
    }
    function valida(c) {
      if (!c.ativo) return "";
      if (!c.questionarioId && !c.contratoAtivo) return "Escolha um questionário ou ative o contrato.";
      if (c.questionarioId && !core.perguntasDo(api.load(), c.questionarioId).length) return "O questionário escolhido está sem perguntas.";
      if (!c.contratoAtivo) return "";
      if (!c.prestador.nome || !c.prestador.documento || !c.prestador.endereco || !c.prestador.email || String(c.prestador.telefone||"").replace(/\D/g,"").length < 10 || !c.prestador.cidade || c.prestador.uf.length !== 2) return "Complete os dados do personal que identificam a parte contratada.";
      if (!documentoOk(c.prestador.documento)) return "Confira o CPF ou CNPJ do personal.";
      if (!/^\S+@\S+\.\S+$/.test(c.prestador.email)) return "Confira o e-mail do personal.";
      if (c.contratoTexto.length < 300) return "O contrato está curto demais. Restaure o modelo e personalize as regras.";
      var obrig = ["aluno_nome","aluno_nacionalidade","aluno_estado_civil","aluno_profissao","aluno_rg","aluno_cpf","aluno_endereco","prestador_nome","prestador_documento"];
      var falta = obrig.filter(function (k) { return c.contratoTexto.indexOf("{{" + k + "}}") < 0; });
      if (falta.length) return "Mantenha no contrato os campos obrigatórios das partes: " + falta.map(function (x) { return "{{" + x + "}}"; }).join(", ") + ".";
      return "";
    }
    card.addEventListener("input", function () { sujo = true; $("ocpStatus").textContent = "Alterações ainda não salvas."; alterna(); });
    card.addEventListener("change", function () { sujo = true; $("ocpStatus").textContent = "Alterações ainda não salvas."; alterna(); });
    $("ocpCriarPerguntas").onclick = function () { if (raiz.__qtAba) raiz.__qtAba("montar"); var b=$("qpNovoBox");if(b){b.open=true;b.scrollIntoView({behavior:"smooth",block:"center"});} };
    $("ocpModelo").onclick = function () { if ($("ocpContratoTexto").value.trim() && !confirm("Substituir o texto atual pelo contrato padrão?")) return; $("ocpContratoTexto").value = core.CONTRATO_PADRAO; sujo = true; $("ocpStatus").textContent = "Modelo restaurado. Confira e salve."; };
    $("ocpPrevia").onclick = function () { var c = rascunho(), d={nome:"Alex da Silva",nacionalidade:"Brasileiro",estadoCivil:"solteiro",profissao:"designer",rg:"MG-12.345.678",rgOrgao:"SSP/MG",cpf:"123.456.789-00",nascimento:"1995-05-20",email:"alex@email.com",telefone:"(31) 99999-0000",cep:"30110-000",logradouro:"Rua Exemplo",numero:"120",complemento:"apto. 4",bairro:"Centro",cidade:"Belo Horizonte",uf:"MG"}; var p={contrato:{prestador:c.prestador,plano:{nome:"Consultoria mensal",valor:400,inicio:new Date().toISOString().slice(0,10)}}}; $("ocpPreview").textContent = core.resolveContrato(c.contratoTexto,d,p); $("ocpPreview").hidden=false; };
    $("ocpDescartar").onclick = function () { if (sujo && !confirm("Descartar as alterações que ainda não foram salvas?")) return; pintaCampos(); };
    $("ocpSalvar").onclick = function () {
      var c = rascunho(), e = valida(c); if (e) { $("ocpStatus").textContent = e; return; }
      var st = api.load(); st.config = st.config || {}; st.config.onboardingConsultoria = c;
      (st.alunos || []).forEach(function (a) { if (a.onboardingConsultoria && a.onboardingConsultoria.requerido) api.marcaPendente(st, a.id); });
      api.save(st); sujo = false; resumo(); $("ocpStatus").textContent = c.ativo ? "✓ Configuração salva. Publique os apps dos alunos marcados para entregar esta versão." : "✓ Recurso desativado. Publique os apps marcados para retirar a exigência."; atualizaNovoAluno(); renderPerfil();
    };

    function atualizaNovoAluno() {
      var box = $("naOnboardingBox"), ck = $("naOnboarding"); if (!box || !ck) return; var c = cfgLida(); box.hidden = !c.ativo; ck.checked = c.ativo;
    }
    document.addEventListener("click", function (e) {
      if (e.target.closest && e.target.closest("#btnNovoAluno")) setTimeout(atualizaNovoAluno);
      if (e.target.closest && (e.target.closest('[data-pfa="app"]') || e.target.closest('[data-a="quest"]'))) setTimeout(function(){renderPerfil();if(!sujo){opcoesQuestionario(cfgLida().questionarioId);resumo();}}, 0);
    });

    function perfilCard() {
      var sec = document.querySelector('#vPerfil [data-pfsec="app"]'), alvo = sec && sec.querySelector(".pfp-group"); if (!sec || !alvo) return null;
      var el = $("pfOnboardingConsultoria"); if (el) return el;
      el = document.createElement("section"); el.id = "pfOnboardingConsultoria"; el.className = "pfp-group ocp-profile"; sec.insertBefore(el, alvo); return el;
    }
    function renderPerfil() {
      var el = perfilCard(), id = api.perfilId(), st = api.load(), a = (st.alunos || []).find(function (x) { return x.id === id; }); if (!el || !a) return;
      var c = cfgLida(), ligado = !!(a.onboardingConsultoria && a.onboardingConsultoria.requerido), pac = ligado && c.ativo ? api.pacote(st, a) : null;
      el.innerHTML = '<div class="ocp-head"><div class="ocp-summary"><strong>Entrada da consultoria</strong><span class="ocp-help">Questionário e contrato antes de liberar o app.</span></div><span id="pfOcBadge" class="ocp-badge ' + (ligado ? "wait" : "") + '">' + (ligado ? "Aguardando" : "Dispensado") + '</span></div>' +
        (!c.ativo ? '<p class="ocp-help">Configure o modelo em Questionários → Criar e organizar.</p><button type="button" class="btn sec" id="pfOcConfig">Abrir configuração</button>' : '<label class="ocp-switch"><input type="checkbox" id="pfOcExige" ' + (ligado ? "checked" : "") + '><span><b>Exigir para este aluno</b><small>Quando desligado, o app abre normalmente para este aluno.</small></span></label><div class="ocp-actions"><button type="button" class="btn sec" id="pfOcPublicar">Publicar esta alteração</button>' + (ligado ? '<button type="button" class="btn sec" id="pfOcRefazer">Solicitar novo preenchimento</button>' : '') + '<button type="button" class="btn sec" id="pfOcVer" hidden>Ver respostas e contrato</button></div><p class="ocp-status" id="pfOcStatus">' + (pac ? "Versão " + esc(pac.v.slice(-8)) + " · conferindo resposta…" : "A exigência está desligada para este aluno.") + "</p>");
      var cfgBt=$("pfOcConfig");if(cfgBt)cfgBt.onclick=abreConfig;
      var ck=$("pfOcExige");if(ck)ck.onchange=function(){var st2=api.load(),a2=(st2.alunos||[]).find(function(x){return x.id===id;});if(!a2)return;if(ck.checked)a2.onboardingConsultoria={requerido:true,revisao:String(Date.now())};else delete a2.onboardingConsultoria;api.marcaPendente(st2,id);api.save(st2);renderPerfil();};
      var pub=$("pfOcPublicar");if(pub)pub.onclick=function(){pub.disabled=true;$("pfOcStatus").textContent="Publicando no app…";api.publicar(id,function(r){pub.disabled=false;$("pfOcStatus").textContent=r&&r.ok?"✓ Alteração publicada no app.":(r&&r.erro)||"Não foi possível publicar agora.";});};
      var re=$("pfOcRefazer");if(re)re.onclick=function(){if(!confirm("Pedir para o aluno preencher novamente? A resposta anterior continua guardada no histórico."))return;var st3=api.load(),a3=(st3.alunos||[]).find(function(x){return x.id===id;});if(!a3)return;a3.onboardingConsultoria={requerido:true,revisao:String(Date.now())};api.marcaPendente(st3,id);api.save(st3);renderPerfil();};
      if (pac && a.appTokenP) buscaAceite(a, pac.v);
    }
    function abreConfig() { var b=document.querySelector('[data-a="quest"]');if(b)b.click();setTimeout(function(){if(raiz.__qtAba)raiz.__qtAba("montar");card.scrollIntoView({behavior:"smooth",block:"start"});},20); }
    function buscaAceite(a, versao) {
      var seq=++consultaSeq,n=api.cloud(); if(!n||!n.client||typeof n.client.from!=="function"){if($("pfOcStatus"))$("pfOcStatus").textContent="Entre na sua conta para conferir o envio do aluno.";return;}
      n.client.from("app_consultoria_aceites").select("id,versao,respostas,dados,assinatura,config_snapshot,documento_texto,documento_hash,aceito_em").eq("academia_id",n.aid).eq("token",a.appTokenP).order("aceito_em",{ascending:false}).limit(1).then(function(r){
        if(seq!==consultaSeq||api.perfilId()!==a.id)return;var st=api.load(),atual=(st.alunos||[]).find(function(x){return x.id===a.id;});if(!atual||atual.appTokenP!==a.appTokenP)return;
        var row=r&&!r.error&&r.data&&r.data[0],status=$("pfOcStatus"),badge=$("pfOcBadge"),ver=$("pfOcVer");
        if(!row){if(status)status.textContent=r&&r.error?"Não foi possível consultar agora.":"O aluno ainda não concluiu esta entrada.";return;}
        respostasCache[a.id]=row;if(row.versao===versao){if(status)status.textContent="Concluído em "+dataBr(row.aceito_em)+" · documento "+String(row.documento_hash||"").slice(0,10);if(badge){badge.textContent="Concluído";badge.className="ocp-badge ok";}if(ver){ver.hidden=false;ver.onclick=function(){abreResultado(a,row);};}}
        else if(status)status.textContent="Existe uma resposta anterior. A versão atual ainda está aguardando preenchimento.";
      },function(){if(seq===consultaSeq&&$("pfOcStatus"))$("pfOcStatus").textContent="Não foi possível consultar agora.";});
    }
    var impressaoAtual=null;
    function abreResultado(a,row){var snap=row.config_snapshot||{},dados=row.dados||{},assin=row.assinatura||{},perg=(row.respostas||[]),doc=row.documento_texto||((snap.contrato||{}).ativo?core.resolveContrato((snap.contrato||{}).texto,dados,snap):"");impressaoAtual={a:a,row:row,doc:doc};$("ocpDialogTitulo").textContent="Entrada de "+a.nome;$("ocpDialogCorpo").innerHTML='<p class="ocp-help">Concluído em '+esc(dataBr(row.aceito_em))+' · versão '+esc(row.versao)+' · integridade '+esc(row.documento_hash||"")+'</p><h3>Respostas</h3><div>'+perg.map(function(x){return '<div class="ocp-answer"><b>'+esc(x.pergunta||"Pergunta")+'</b><span>'+esc(x.resposta||"—")+'</span></div>';}).join("")+'</div><h3>Dados do contratante</h3><div class="ocp-answer">'+Object.keys(dados).filter(function(k){return dados[k];}).map(function(k){return '<b style="display:inline">'+esc(k.replace(/([A-Z])/g," $1"))+':</b> '+esc(dados[k])+'<br>';}).join("")+'</div>'+(doc?'<h3>Contrato aceito</h3><div class="ocp-contract">'+esc(doc)+'</div><p class="ocp-help">Aceite em nome de <b>'+esc(assin.nome||dados.nome||"")+'</b>.</p>':'')+(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(assin.imagem||"")?'<img class="ocp-signature" alt="Assinatura do aluno" src="'+assin.imagem+'">':"");$("ocpImprimir").hidden=!doc;dlg.showModal();}
    function imprimirAtual(){if(!impressaoAtual)return;var x=impressaoAtual,row=x.row,d=row.dados||{},a=row.assinatura||{},w=window.open("","_blank");if(!w)return;w.document.write('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Contrato · '+esc(x.a.nome)+'</title><style>body{font-family:Arial,sans-serif;max-width:780px;margin:36px auto;padding:0 24px;color:#17131d;line-height:1.55}h1{font-size:22px}pre{white-space:pre-wrap;font:14px/1.65 Arial,sans-serif}small{color:#625b70}.sig{max-width:320px;border-bottom:1px solid #777;margin-top:28px} @media print{button{display:none}}</style><h1>'+esc(((row.config_snapshot||{}).contrato||{}).titulo||"Contrato de consultoria")+'</h1><pre>'+esc(x.doc)+'</pre><p><b>Aceite eletrônico:</b> '+esc(a.nome||d.nome||"")+'<br><small>'+esc(row.aceito_em||"")+' · versão '+esc(row.versao)+' · SHA-256 '+esc(row.documento_hash||"")+'</small></p>'+(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(a.imagem||"")?'<img class="sig" src="'+a.imagem+'">':"")+'<p><button onclick="print()">Imprimir / salvar em PDF</button></p>');w.document.close();}

    pintaCampos(); atualizaNovoAluno(); renderPerfil();
    if (api.onChange) api.onChange(function (k) { if (k !== "ptStudio") return; atualizaNovoAluno(); renderPerfil(); if(!sujo){opcoesQuestionario(cfgLida().questionarioId);resumo();} });
    raiz.MT_PERSONAL_ONBOARDING = { render: renderPerfil, config: pintaCampos, pacote: core.pacote };
  }
  raiz.MT_PERSONAL_ONBOARDING_INIT = { init: init };
})(typeof self !== "undefined" ? self : this);
