/* Nutrição dentro do Personal: cadastro único, rascunhos por aluno e publicação canônica. */
(function (root) {
  'use strict';
  var C, S, N, alunoId = '', area = 'plano', drafts = Object.create(null), mensagens = Object.create(null), geracoes = Object.create(null), registrosCache = Object.create(null), registrosBusca = Object.create(null), seq = 0, mostrando = 40, pickMais = 30, soFav = false, picker = null, dono = null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); };
  var norm = function (v) { return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); };
  var clone = function (v) { return JSON.parse(JSON.stringify(v)); };
  var uid = function () { return S.uid(); };
  function state(st) { return st.nutricaoV1 || { planos: {}, favoritos: [], alimentos: [] }; }
  function plano(st, id) { return N.normalizaPlano((state(st).planos || {})[id]); }
  function assinatura(st, id) { return JSON.stringify(plano(st, id)); }
  function aluno(st, id) { return (st.alunos || []).find(function (a) { return a.id === id; }); }
  function atual() { return drafts[alunoId]; }
  function confereConta() {
    var cloud = S.cloud && S.cloud(), user = S.usuario && S.usuario(), email = String(user && user.email || ''), aid = String(cloud && cloud.aid || '');
    if (!dono) { dono = { email: email, aid: aid }; return true; }
    var mudou = dono.email !== email || (!!dono.aid && !!aid && dono.aid !== aid);
    dono = { email: email, aid: aid || (mudou ? '' : dono.aid) };
    if (mudou) { drafts = Object.create(null); mensagens = Object.create(null); geracoes = Object.create(null); registrosCache = Object.create(null); registrosBusca = Object.create(null); alunoId = ''; picker = null; if ($('pnFoodDialog').open) $('pnFoodDialog').close(); return false; }
    return true;
  }
  function avisa(s) { mensagens[alunoId] = s; $('pnStatus').textContent = s; }
  function fmt(v) { return Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }); }
  function totais(itens) { var t = N.totalItens(itens); return '<b>' + fmt(t.k) + ' kcal</b><span>Proteínas ' + fmt(t.pt) + ' g</span><span>Carboidratos ' + fmt(t.cb) + ' g</span><span>Gorduras ' + fmt(t.g) + ' g</span>'; }
  function itensPlano(p) { return p.refeicoes.reduce(function (all, r) { return all.concat(r.itens); }, []); }
  function catalogo(st) {
    return (root.MT_ALIMENTOS || []).map(function (a) { return { id: 'cat:' + a.n, nome: a.n, porcao: a.p, k: +a.k || 0, pt: +a.pt || 0, cb: +a.cb || 0, g: +a.g || 0, categoria: a.c }; }).concat((state(st).alimentos || []).filter(function (a) { return a && a.id && a.nome; }).map(function (a) { return Object.assign({}, a, { categoria: 'Meus alimentos' }); }));
  }
  function htmlPlano(p) {
    if (!p) return '<p class="muted">Nenhum plano alimentar aplicado para este aluno.</p>';
    return '<div class="pn-head"><div><h3>' + esc(p.titulo || 'Plano alimentar') + '</h3><p class="muted">' + esc(p.objetivo) + (p.ativo ? '' : ' · Plano pausado') + '</p></div></div>' +
      '<div class="pn-macros">' + totais(itensPlano(p)) + '</div>' + p.refeicoes.map(function (r) {
        return '<section class="pn-meal"><div class="pn-head"><h4>' + esc(r.hora ? r.hora + ' · ' : '') + esc(r.titulo || 'Refeição') + '</h4><span class="muted">' + fmt(N.totalItens(r.itens).k) + ' kcal</span></div><ul class="pn-plan-list">' + r.itens.map(function (it) { return '<li><span>' + esc(it.nome) + '</span><span class="muted">' + fmt(it.qtd) + ' × ' + esc(it.porcao || 'porção') + '</span></li>'; }).join('') + '</ul></section>';
      }).join('') + (p.orientacoes ? '<p class="pn-preline">' + esc(p.orientacoes) + '</p>' : '') + ((p.responsavel || p.crn) ? '<p class="muted">Responsável: ' + esc(p.responsavel || 'Não informado') + (p.crn ? ' · CRN ' + esc(p.crn) : '') + '</p>' : '');
  }
  function opcoesAlunos() {
    var st = C.load(), q = norm($('pnAlunoBusca').value), ativos = (st.alunos || []).filter(function (a) { return a.ativo !== false; });
    var html = '<option value="">Escolha um aluno</option>' + ativos.filter(function (a) { return a.id === alunoId || !q || norm(a.nome + ' ' + (a.zap || '')).indexOf(q) >= 0; }).map(function (a) { return '<option value="' + esc(a.id) + '">' + esc(a.nome) + '</option>'; }).join('');
    if ($('pnAluno').dataset.opcoes !== html) { $('pnAluno').innerHTML = html; $('pnAluno').dataset.opcoes = html; }
    $('pnAluno').value = alunoId;
  }
  function seleciona(id) {
    var a = aluno(C.load(), id); alunoId = a && a.ativo !== false ? id : '';
    picker = null; if ($('pnFoodDialog').open) $('pnFoodDialog').close();
    opcoesAlunos(); pinta();
  }
  function abre(id) { if (!C) return; confereConta(); if (id != null) seleciona(id); else { opcoesAlunos(); pinta(); } }
  function vai(id) { var b = document.querySelector('#abas [data-a="nutricao"]'); if (b) b.click(); seleciona(id); mudaArea('plano'); }
  function mudaArea(v) {
    area = ['plano','biblioteca','registros'].indexOf(v) >= 0 ? v : 'plano';
    document.querySelectorAll('[data-pnsec]').forEach(function (e) { e.hidden = e.dataset.pnsec !== area; });
    document.querySelectorAll('[data-pna]').forEach(function (b) { b.classList.toggle('ativa', b.dataset.pna === area); b.setAttribute('aria-pressed', String(b.dataset.pna === area)); });
    $('pnArea').value = area; if (area === 'biblioteca') pintaCatalogo(); if (area === 'registros') pintaRegistros();
  }
  function pinta() {
    if (!C) return;
    var st = C.load(), a = aluno(st, alunoId), p = plano(st, alunoId), d = atual();
    $('pnPlano').innerHTML = !a ? '<p class="muted">Escolha um aluno para montar ou consultar seu plano alimentar.</p>' : htmlPlano(p);
    $('pnNovo').hidden = !!p || !!d; $('pnNovo').disabled = !a;
    $('pnEditar').hidden = !p || !!d; $('pnPublicar').hidden = !p || !!d;
    $('pnAcesso').hidden = !a || (!!a.appTokenP && !a.appRevogadoEm);
    $('pnStatus').textContent = mensagens[alunoId] || (d ? 'Rascunho deste aluno preservado nesta sessão.' : '');
    $('pnEditor').hidden = !d || !!d.revisao; $('pnRevisao').hidden = !d || !d.revisao;
    $('pnDescartarIA').hidden = !d || !d.anteriorIA;
    if (d) { if (d.revisao) $('pnRevisaoConteudo').innerHTML = htmlPlano(d.plano); else pintaEditor(); }
    pintaIA(); if (area === 'registros') pintaRegistros();
  }
  function novo(editar) {
    var st = C.load(), a = aluno(st, alunoId); if (!a || a.ativo === false) { avisa('Escolha um aluno ativo.'); return; }
    if (!atual()) drafts[alunoId] = { base: assinatura(st, alunoId), plano: editar && plano(st, alunoId) ? clone(plano(st, alunoId)) : { v: 1, ativo: true, id: uid(), atualizadoEm: '', titulo: 'Plano alimentar', objetivo: '', orientacoes: '', responsavel: '', crn: '', refeicoes: [] }, pedido: '', revisao: false };
    avisa('Rascunho de ' + a.nome + '. Revise e aplique quando estiver pronto.'); pinta(); $('pnTitulo').focus();
  }
  function pintaEditor() {
    var d = atual(); if (!d) return;
    [['pnTitulo','titulo'],['pnObjetivo','objetivo'],['pnOrientacoes','orientacoes'],['pnResponsavel','responsavel'],['pnCrn','crn']].forEach(function (p) { $(p[0]).value = d.plano[p[1]] || ''; });
    $('pnIAPedido').value = d.pedido || '';
    $('pnAtivo').checked = d.plano.ativo !== false;
    $('pnRefeicoes').innerHTML = d.plano.refeicoes.map(function (r, ri) {
      return '<section class="pn-meal"><div class="pn-fields"><label class="pn-field">Refeição<input data-pnref="' + ri + '" data-pnkey="titulo" value="' + esc(r.titulo) + '" maxlength="120"></label><label class="pn-field">Horário<input type="time" data-pnref="' + ri + '" data-pnkey="hora" value="' + esc(r.hora) + '"></label></div><div class="pn-items">' + r.itens.map(function (it, ii) {
        return '<div class="pn-food-row"><div><b>' + esc(it.nome) + '</b><small>' + esc(it.porcao) + ' · ' + fmt(it.k) + ' kcal por porção</small></div><label class="pn-qty">Porções<input inputmode="decimal" data-pnqref="' + ri + '" data-pnqitem="' + ii + '" value="' + esc(it.qtd) + '" aria-label="Porções de ' + esc(it.nome) + '"></label><button type="button" class="btn sec mini" data-pnrmitem="' + ii + '" data-pnri="' + ri + '" aria-label="Remover ' + esc(it.nome) + '">Remover</button></div>';
      }).join('') + '</div><div class="pn-actions"><button type="button" class="btn sec" data-pnfood="' + ri + '">Adicionar alimento</button><button type="button" class="btn sec" data-pnrmref="' + ri + '">Remover refeição</button></div></section>';
    }).join('') || '<p class="muted">Adicione a primeira refeição para começar.</p>';
  }
  function valida(p) {
    if (!p.titulo.trim()) return 'Dê um nome ao plano.';
    if (!p.refeicoes.length) return 'Adicione pelo menos uma refeição.';
    for (var ri = 0; ri < p.refeicoes.length; ri++) {
      var r = p.refeicoes[ri]; if (!r.titulo.trim()) return 'Informe o nome da refeição ' + (ri + 1) + '.';
      if (r.hora && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(r.hora)) return 'Confira o horário de ' + r.titulo + '.';
      if (!r.itens.length) return 'Adicione alimentos em ' + r.titulo + ' ou remova essa refeição.';
      for (var ii = 0; ii < r.itens.length; ii++) if (!N.normalizaItem(r.itens[ii])) return 'Confira as porções de ' + (r.itens[ii].nome || 'um alimento') + ': use um número maior que zero.';
    }
    return '';
  }
  function revisar() { var d = atual(); if (!d) return; var erro = valida(d.plano); if (erro) { avisa(erro); return; } d.revisao = true; avisa('Confira as refeições e as porções antes de aplicar ao aluno selecionado.'); pinta(); $('pnRevisao').scrollIntoView({ block: 'start', behavior: 'smooth' }); }
  function aplicar() {
    if (!confereConta()) { pinta(); return; }
    var d = atual(); if (!d || !d.revisao) return;
    var st = C.load(), a = aluno(st, alunoId), erro = valida(d.plano);
    if (!a || a.ativo === false) { avisa('Este aluno não está mais ativo. O rascunho foi preservado.'); return; }
    if (erro) { avisa(erro); return; }
    if (assinatura(st, alunoId) !== d.base) { avisa('O plano salvo mudou desde que você começou. Seu rascunho foi preservado; confira o plano atual antes de descartar e editar novamente.'); return; }
    var p = N.normalizaPlano(d.plano); p.atualizadoEm = new Date().toISOString(); if (!p.id) p.id = uid();
    var nv = state(st); st.nutricaoV1 = Object.assign({}, nv, { planos: Object.assign({}, nv.planos || {}) }); st.nutricaoV1.planos[alunoId] = p;
    C.marcaPendente(st, alunoId);
    if (!C.save(st)) { avisa('Não foi possível salvar neste aparelho. Seu rascunho continua aberto.'); return; }
    delete drafts[alunoId]; avisa('Plano aplicado. Use Publicar no app para entregar a atualização ao aluno.'); pinta();
  }
  function publicar() {
    if (!confereConta()) { pinta(); return; }
    if (atual()) { avisa('Revise e aplique o rascunho antes de publicar.'); return; }
    var st = C.load(), p = plano(st, alunoId), a = aluno(st, alunoId); if (!p || !a) return;
    var id = alunoId, snap = assinatura(st, id);
    if (!confirm('Publicar o plano alimentar de ' + a.nome + ' no app?\n\nO app também recebe as atualizações já aplicadas ao treino e ao cadastro.')) return;
    if (id !== alunoId || assinatura(C.load(), id) !== snap) { avisa('O plano mudou. Confira novamente antes de publicar.'); return; }
    $('pnPublicar').disabled = true; avisa('Publicando no app…');
    C.publicar(id, function (r) { $('pnPublicar').disabled = false; mensagens[id] = r && r.erro ? r.erro : 'Plano publicado no app do aluno.'; if (alunoId === id) pinta(); });
  }
  function pintaCatalogo() {
    if (!C) return; var st = C.load(), list = catalogo(st), q = norm($('pnBusca').value), cat = $('pnCategoria').value, fav = state(st).favoritos || [];
    var cats = Array.from(new Set(list.map(function (a) { return a.categoria; }))).sort();
    $('pnCategoria').innerHTML = '<option value="">Todas as categorias</option>' + cats.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join(''); $('pnCategoria').value = cat;
    var filtered = list.filter(function (a) { return (!q || norm(a.nome).indexOf(q) >= 0) && (!cat || a.categoria === cat) && (!soFav || fav.indexOf(a.id) >= 0); });
    $('pnTotalCatalogo').textContent = filtered.length + ' alimentos · valores médios por porção';
    $('pnCatalogo').innerHTML = filtered.slice(0, mostrando).map(function (a) { var f = fav.indexOf(a.id) >= 0; return '<div class="pn-food-row"><div><b>' + esc(a.nome) + '</b><small>' + esc(a.porcao) + ' · ' + fmt(a.k) + ' kcal</small><small>P ' + fmt(a.pt) + ' g · C ' + fmt(a.cb) + ' g · G ' + fmt(a.g) + ' g</small></div><button type="button" class="btn sec mini" data-pnfav="' + esc(a.id) + '" aria-pressed="' + f + '" aria-label="' + (f ? 'Remover dos favoritos: ' : 'Favoritar: ') + esc(a.nome) + '">' + (f ? '★ Favorito' : '☆ Favoritar') + '</button></div>'; }).join('') || '<p class="muted">Nenhum alimento encontrado com esses filtros.</p>';
    $('pnMais').hidden = filtered.length <= mostrando; $('pnFavoritos').setAttribute('aria-pressed', String(soFav));
  }
  function favorito(id) { var st = C.load(), nv = state(st), fav = (nv.favoritos || []).slice(), i = fav.indexOf(id); if (i < 0) fav.push(id); else fav.splice(i, 1); st.nutricaoV1 = Object.assign({}, nv, { favoritos: fav }); if (!C.save(st)) avisa('Não foi possível salvar o favorito.'); pintaCatalogo(); }
  function alimentoNovo() {
    var it = { id: uid(), alimId: '', nome: $('pnAlNome').value.trim(), porcao: $('pnAlPorcao').value.trim(), qtd: 1, k: $('pnAlK').value, pt: $('pnAlPt').value, cb: $('pnAlCb').value, g: $('pnAlG').value }, n = N.normalizaItem(it);
    if (!n || !it.porcao) { $('pnAlStatus').textContent = 'Informe nome, porção e todos os valores nutricionais. Zero é válido.'; return; }
    var st = C.load(); if (catalogo(st).some(function (a) { return norm(a.nome) === norm(n.nome); })) { $('pnAlStatus').textContent = 'Já existe um alimento com esse nome. Use um nome específico para o seu item.'; return; }
    var nv = state(st); st.nutricaoV1 = Object.assign({}, nv, { alimentos: (nv.alimentos || []).concat([n]) });
    if (!C.save(st)) { $('pnAlStatus').textContent = 'Não foi possível salvar. Os campos foram preservados.'; return; }
    ['pnAlNome','pnAlPorcao','pnAlK','pnAlPt','pnAlCb','pnAlG'].forEach(function (id) { $(id).value = ''; }); $('pnAlStatus').textContent = 'Alimento salvo na sua biblioteca.'; pintaCatalogo();
  }
  function abrePicker(ri) {
    var d = atual(); if (!d || !d.plano.refeicoes[ri]) return;
    picker = { aluno: alunoId, ref: d.plano.refeicoes[ri].id }; pickMais = 30; $('pnPickBusca').value = '';
    $('pnFoodDestino').textContent = 'Adicionar em ' + d.plano.refeicoes[ri].titulo; pintaPicker(); $('pnFoodDialog').showModal(); $('pnPickBusca').focus();
  }
  function pintaPicker() { var q = norm($('pnPickBusca').value), st = C.load(), fav = state(st).favoritos || [], list = catalogo(st).filter(function (a) { return !q || norm(a.nome).indexOf(q) >= 0; }).sort(function (a, b) { return Number(fav.indexOf(b.id) >= 0) - Number(fav.indexOf(a.id) >= 0); }); $('pnPickLista').innerHTML = list.slice(0, pickMais).map(function (a) { return '<div class="pn-food-row"><div><b>' + esc(a.nome) + '</b><small>' + esc(a.porcao) + ' · ' + fmt(a.k) + ' kcal</small></div><button type="button" class="btn sec" data-pnadd="' + esc(a.id) + '" aria-label="Adicionar ' + esc(a.nome) + '">Adicionar</button></div>'; }).join('') || '<p class="muted">Nenhum alimento encontrado. Você pode cadastrar um alimento próprio na Biblioteca.</p>'; $('pnPickMais').hidden = list.length <= pickMais; }
  function adicionaAlimento(id) { var d = atual(), ref = d && picker && picker.aluno === alunoId && d.plano.refeicoes.find(function (r) { return r.id === picker.ref; }), a = catalogo(C.load()).find(function (x) { return x.id === id; }); if (!ref || !a) return; if (ref.itens.length >= 100) { avisa('Esta refeição atingiu o limite de 100 itens.'); return; } ref.itens.push(N.normalizaItem(Object.assign({}, a, { id: uid(), alimId: a.id, qtd: 1 }))); d.revisao = false; $('pnFoodDialog').close(); picker = null; pintaEditor(); }
  function registros(st, id) { var a = aluno(st, id), remoto = Object.prototype.hasOwnProperty.call(registrosCache,id) ? registrosCache[id] : null, map = remoto ? remoto.registros || {} : a && ((a.retorno || {}).nutricaoV1 || {}).registros || {}; return Object.keys(map).map(function (key) { return N.normalizaRegistro(map[key]); }).filter(function (r) { return r && !r.apagado; }).sort(function (a, b) { return (b.d + b.hora).localeCompare(a.d + a.hora); }); }
  function registrosHtml(list) {
    if (!list.length) return '<p class="muted">Nenhuma refeição registrada neste período. Os registros aparecem após o aluno sincronizar o app.</p>';
    var dias = {}; list.forEach(function (r) { (dias[r.d] = dias[r.d] || []).push(r); });
    return Object.keys(dias).map(function (d) { var rows = dias[d]; return '<section class="pn-meal"><div class="pn-head"><h4>' + d.slice(8) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) + '</h4><span class="muted">' + fmt(N.totalItens(rows.reduce(function (all, r) { return all.concat(r.itens); }, [])).k) + ' kcal registradas</span></div>' + rows.map(function (r) { return '<details class="pn-details"><summary>' + esc((r.hora ? r.hora + ' · ' : '') + r.titulo) + ' <span class="muted">' + fmt(N.totalItens(r.itens).k) + ' kcal' + (r.estimativa ? ' · estimativa' : '') + '</span></summary><ul class="pn-plan-list">' + r.itens.map(function (it) { return '<li><span>' + esc(it.nome) + '</span><span>' + fmt(it.qtd) + ' × ' + esc(it.porcao) + '</span></li>'; }).join('') + '</ul>' + (r.observacao ? '<p class="pn-preline">' + esc(r.observacao) + '</p>' : '') + (r.foto ? '<img class="pn-record-photo" src="' + esc(r.foto) + '" alt="Foto da refeição registrada pelo aluno">' : '') + '</details>'; }).join('') + '</section>'; }).join('');
  }
  function buscaRegistros(id, novamente) {
    var st=C.load(),a=aluno(st,id),n=S.cloud&&S.cloud(); if(!a||!a.appTokenP)return;
    if(!novamente&&(Object.prototype.hasOwnProperty.call(registrosCache,id)||registrosBusca[id]))return;
    if(!n||!n.client||typeof n.client.from!=='function'){registrosBusca[id]={erro:'Entre na sua conta para consultar os registros na nuvem.'};if(area==='registros'&&alunoId===id)pintaRegistros();return;}
    var pedido={token:a.appTokenP,aid:n.aid,carregando:true};registrosBusca[id]=pedido;
    if(area==='registros'&&alunoId===id)pintaRegistros();
    n.client.from('app_aluno').select('retorno').eq('academia_id',n.aid).eq('token',a.appTokenP).limit(1).then(function(r){
      var atual=aluno(C.load(),id);if(registrosBusca[id]!==pedido||!atual||atual.appTokenP!==pedido.token)return;
      if(r&&r.error){registrosBusca[id]={erro:'Não foi possível consultar agora. Tente novamente.'};}
      else{var row=r&&r.data&&r.data[0],nutri=row&&row.retorno&&row.retorno.nutricaoV1;registrosCache[id]=nutri&&typeof nutri==='object'&&!Array.isArray(nutri)?clone(nutri):{v:1,registros:{}};registrosBusca[id]={pronto:true};}
      if(area==='registros'&&alunoId===id)pintaRegistros();if(C.perfilId&&C.perfilId()===id&&$('pfArea').value==='alimentacao')perfil(id);
    },function(){if(registrosBusca[id]===pedido){registrosBusca[id]={erro:'Não foi possível consultar agora. Tente novamente.'};if(area==='registros'&&alunoId===id)pintaRegistros();}});
  }
  function pintaRegistros() { var id=alunoId,list = registros(C.load(), id), busca=id&&registrosBusca[id], dias = +$('pnPeriodo').value; if (dias) { var d = new Date(S.todayISO() + 'T12:00:00'); d.setDate(d.getDate() - dias + 1); var ini = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); list = list.filter(function (r) { return r.d >= ini && r.d <= S.todayISO(); }); } if(!id){$('pnRegistros').innerHTML='<p class="muted">Escolha um aluno para consultar os registros.</p>';return;} if(!Object.prototype.hasOwnProperty.call(registrosCache,id)&&!busca)buscaRegistros(id);busca=registrosBusca[id];if(busca&&busca.carregando&&!list.length){$('pnRegistros').innerHTML='<p class="muted">Carregando os registros do aluno…</p>';return;}if(busca&&busca.erro&&!list.length){$('pnRegistros').innerHTML='<p class="muted">'+esc(busca.erro)+'</p><button type="button" class="btn sec" id="pnRegTentar">Tentar novamente</button>';$('pnRegTentar').onclick=function(){delete registrosBusca[id];buscaRegistros(id,true);};return;}$('pnRegistros').innerHTML=registrosHtml(list)+(busca&&busca.carregando?'<p class="muted">Atualizando registros…</p>':''); }
  function perfil(id) { if (!C || !$('pfNutricao')) return; var st = C.load(), p = plano(st, id); $('pfNutricao').innerHTML = htmlPlano(p) + '<details class="pn-details"><summary>Últimos registros de alimentação</summary>' + registrosHtml(registros(st, id).slice(0, 7)) + '</details>'; }
  function contexto(st, id) { var a = aluno(st, id); return JSON.stringify({ aluno: a ? { id: a.id, nome: a.nome, sexo: a.sexo, nasc: a.nasc, altura: a.altura, peso: a.peso, obs: a.obs, anamnese: a.anamnese } : null, avaliacoes: (st.avaliacoes || []).filter(function (v) { return v.alunoId === id; }), plano: plano(st, id) }); }
  function promptIA(st, a, d) {
    var prioridade = (state(st).favoritos || []).concat(itensPlano(d.plano).map(function (it) { return it.alimId; }));
    var lines = catalogo(st).sort(function (a, b) { return Number(prioridade.indexOf(b.id) >= 0) - Number(prioridade.indexOf(a.id) >= 0); }).map(function (al) { return al.nome + ' (' + al.porcao + ', ' + al.k + ' kcal)'; });
    var pre = 'ALUNO: ' + a.nome + '\nOBJETIVO: ' + d.plano.objetivo + '\nCADASTRO INFORMADO: ' + JSON.stringify({ sexo: a.sexo, nascimento: a.nasc, altura: a.altura, peso: a.peso, anamnese: a.anamnese || {}, observacoes: a.obs || '' }) + '\nORIENTAÇÕES DO PROFISSIONAL: ' + d.plano.orientacoes + '\nPREFERÊNCIAS E RESTRIÇÕES: ' + (d.pedido || 'Não informadas; não assumir ausência de alergias.') + '\nUse somente os nomes exatos do catálogo. qtd multiplica a porção base. Não invente medidas ausentes. Retorne uma proposta para revisão profissional.\nCATÁLOGO DISPONÍVEL:\n';
    var saida = pre.slice(0, 15000); lines.forEach(function (line) { if (saida.length + line.length < 57000) saida += line + '\n'; }); return saida;
  }
  function parseIA(v) { var s = String(v || '').replace(/```json|```/g, '').trim(), i = s.indexOf('{'), n = 0, str = false; for (var k = i; i >= 0 && k < s.length; k++) { var c = s[k]; if (str) { if (c === '\\') k++; else if (c === '"') str = false; } else if (c === '"') str = true; else if (c === '{') n++; else if (c === '}' && --n === 0) { try { return JSON.parse(s.slice(i, k + 1)); } catch (_) { return null; } } } return null; }
  function pintaIA() { var g = geracoes[alunoId], d = atual(); $('pnIAGerar').disabled = !!g; $('pnIACancelar').hidden = !g; $('pnIAStatus').textContent = g ? 'Montando uma proposta para este aluno…' : d && d.iaStatus || ''; }
  function gerarIA() {
    if (!confereConta()) { pinta(); return; }
    var st = C.load(), a = aluno(st, alunoId), d = atual(), cloud = S.cloud && S.cloud(); if (!a || !d) return;
    if (!cloud || !cloud.client || !root.MT_FUNCAO) { d.iaStatus = 'Entre na sua conta para gerar uma proposta com IA. Você pode continuar montando o plano manualmente.'; pintaIA(); return; }
    var id = alunoId, g = { seq: ++seq, draft: JSON.stringify(d.plano), pedido: d.pedido, contexto: contexto(st, id), aid: cloud.aid }; geracoes[id] = g; pintaIA();
    var req; try { req = root.MT_FUNCAO.chama(cloud.client, 'chat-envia', { acao: 'ia_dieta', dados: promptIA(st, a, d) }, 'A IA de dieta'); } catch (e) { req = Promise.reject(e); }
    Promise.resolve(req).then(function (r) {
      if (geracoes[id] !== g) return; var draft = drafts[id], agora = S.cloud && S.cloud();
      if (!draft) return;
      if (!agora || agora.aid !== g.aid || contexto(C.load(), id) !== g.contexto || JSON.stringify(draft.plano) !== g.draft || draft.pedido !== g.pedido) { delete geracoes[id]; draft.iaStatus = 'O aluno, o plano ou as orientações mudaram durante a geração. A resposta foi descartada; seu rascunho foi preservado.'; if (id === alunoId) pintaIA(); return; }
      if (!r || !r.ok || !r.texto) throw new Error(r && r.erro || 'Não foi possível gerar a proposta. Tente novamente.');
      var res = parseIA(r.texto); if (!res || !Array.isArray(res.refeicoes)) throw new Error('A IA respondeu em formato inesperado. Seu rascunho foi preservado.');
      var lista = catalogo(C.load()), perdidos = [], refs = [];
      res.refeicoes.slice(0, 30).forEach(function (ref) { if (!ref || !Array.isArray(ref.itens)) return; var itens = [];
        ref.itens.slice(0, 100).forEach(function (it) { if (!it) return; var nome = norm(it.nome), al = lista.find(function (x) { return norm(x.nome) === nome; }); if (!al) { perdidos.push(String(it.nome || 'Alimento sem nome')); return; } var n = N.normalizaItem(Object.assign({}, al, { id: uid(), alimId: al.id, qtd: it.qtd })); if (n) itens.push(n); else perdidos.push(al.nome + ' (porção inválida)'); });
        if (itens.length) refs.push({ id: uid(), hora: /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(ref.hora || '')) ? ref.hora : '', titulo: String(ref.titulo || 'Refeição').slice(0, 120), itens: itens });
      });
      if (!refs.length) throw new Error('A IA não retornou alimentos válidos da biblioteca. Seu rascunho foi preservado.');
      delete geracoes[id]; draft.anteriorIA = clone(draft.plano); draft.plano.refeicoes = refs; draft.revisao = true;
      draft.iaStatus = (r.simulado ? 'Demonstração: proposta de exemplo; nenhuma IA foi consultada.' : 'Proposta pronta para revisão.') + (perdidos.length ? ' Itens não incluídos: ' + perdidos.slice(0, 12).join(', ') + '. Confira o plano antes de aplicar.' : '');
      mensagens[id] = draft.iaStatus; if (id === alunoId) pinta();
    }).catch(function (e) { if (geracoes[id] !== g) return; delete geracoes[id]; if (drafts[id]) drafts[id].iaStatus = String(e && e.message || 'Sem conexão agora. Seu rascunho foi preservado.'); if (id === alunoId) pintaIA(); });
  }
  function init(bridge) {
    C = bridge; S = root.MTStore; N = root.MT_NUTRICAO;
    confereConta();
    var opt = document.createElement('option'); opt.value = 'alimentacao'; opt.textContent = 'Alimentação'; $('pfArea').querySelector('option[value="treino"]').after(opt);
    $('pfAbas').querySelector('[data-pfa="treino"]').after($('pfAbas').querySelector('[data-pfa="alimentacao"]'));
    $('pnAlunoBusca').addEventListener('input', opcoesAlunos); $('pnAluno').addEventListener('change', function () { seleciona(this.value); });
    $('pnArea').addEventListener('change', function () { mudaArea(this.value); }); $('pnAbas').addEventListener('click', function (e) { var b = e.target.closest('[data-pna]'); if (b) mudaArea(b.dataset.pna); });
    $('pnNovo').onclick = function () { novo(false); }; $('pnEditar').onclick = function () { novo(true); };
    $('pnCancelar').onclick = function () { if (!atual() || !confirm('Descartar o rascunho deste aluno? O plano aplicado permanece.')) return; delete drafts[alunoId]; delete geracoes[alunoId]; avisa('Rascunho descartado.'); pinta(); };
    [['pnTitulo','titulo'],['pnObjetivo','objetivo'],['pnOrientacoes','orientacoes'],['pnResponsavel','responsavel'],['pnCrn','crn']].forEach(function (p) { $(p[0]).addEventListener('input', function () { if (atual()) { atual().plano[p[1]] = this.value; atual().revisao = false; } }); });
    $('pnIAPedido').addEventListener('input', function () { if (atual()) atual().pedido = this.value; });
    $('pnAtivo').onchange = function () { if (atual()) atual().plano.ativo = this.checked; };
    $('pnAddRefeicao').onclick = function () { var d = atual(); if (!d) return; if (d.plano.refeicoes.length >= 30) { avisa('O plano atingiu o limite de 30 refeições.'); return; } d.plano.refeicoes.push({ id: uid(), titulo: 'Refeição ' + (d.plano.refeicoes.length + 1), hora: '', itens: [] }); pintaEditor(); };
    $('pnRefeicoes').addEventListener('input', function (e) { var d = atual(), t = e.target; if (!d) return; if (t.hasAttribute('data-pnref')) d.plano.refeicoes[+t.dataset.pnref][t.dataset.pnkey] = t.value; if (t.hasAttribute('data-pnqref')) d.plano.refeicoes[+t.dataset.pnqref].itens[+t.dataset.pnqitem].qtd = t.value; d.revisao = false; });
    $('pnRefeicoes').addEventListener('click', function (e) { var d = atual(), b = e.target.closest('button'); if (!d || !b) return; if (b.hasAttribute('data-pnfood')) abrePicker(+b.dataset.pnfood); if (b.hasAttribute('data-pnrmitem')) { d.plano.refeicoes[+b.dataset.pnri].itens.splice(+b.dataset.pnrmitem, 1); pintaEditor(); } if (b.hasAttribute('data-pnrmref')) { var r = d.plano.refeicoes[+b.dataset.pnrmref]; if (r.itens.length && !confirm('Remover ' + r.titulo + ' e seus alimentos deste rascunho?')) return; d.plano.refeicoes.splice(+b.dataset.pnrmref, 1); pintaEditor(); } });
    $('pnRevisar').onclick = revisar; $('pnAplicar').onclick = aplicar; $('pnVoltarEditor').onclick = function () { if (atual()) atual().revisao = false; pinta(); }; $('pnPublicar').onclick = publicar;
    $('pnDescartarIA').onclick = function () { var d = atual(); if (!d || !d.anteriorIA) return; d.plano = d.anteriorIA; delete d.anteriorIA; d.revisao = false; d.iaStatus = 'Proposta descartada. O rascunho anterior foi restaurado.'; avisa(d.iaStatus); pinta(); };
    $('pnAcesso').onclick = function () { if (alunoId) C.acesso(alunoId); }; $('pfNutricaoAbrir').onclick = function () { vai(C.perfilId()); };
    $('pnBusca').oninput = function () { mostrando = 40; pintaCatalogo(); }; $('pnCategoria').onchange = function () { mostrando = 40; pintaCatalogo(); };
    $('pnFavoritos').onclick = function () { soFav = !soFav; mostrando = 40; pintaCatalogo(); }; $('pnMais').onclick = function () { mostrando += 40; pintaCatalogo(); };
    $('pnCatalogo').onclick = function (e) { var b = e.target.closest('[data-pnfav]'); if (b) favorito(b.dataset.pnfav); }; $('pnAlSalvar').onclick = alimentoNovo;
    $('pnFoodFechar').onclick = function () { $('pnFoodDialog').close(); picker = null; }; $('pnPickBusca').oninput = function () { pickMais = 30; pintaPicker(); }; $('pnPickMais').onclick = function () { pickMais += 30; pintaPicker(); }; $('pnPickLista').onclick = function (e) { var b = e.target.closest('[data-pnadd]'); if (b) adicionaAlimento(b.dataset.pnadd); };
    $('pnIAGerar').onclick = gerarIA; $('pnIACancelar').onclick = function () { delete geracoes[alunoId]; if (atual()) atual().iaStatus = 'Geração cancelada. Seu rascunho foi preservado.'; pintaIA(); };
    $('pnPeriodo').onchange = pintaRegistros; opcoesAlunos(); mudaArea('plano');
  }
  root.MT_PERSONAL_NUTRICAO = { init: init, abre: abre, vai: vai, perfil: perfil, render: function () { if (!C) return; var mesmaConta = confereConta(); opcoesAlunos(); if (!$('vNutricao').hidden) { if (!mesmaConta || !atual()) pinta(); else if (area === 'registros') pintaRegistros(); } if (!$('vPerfil').hidden && $('pfArea').value === 'alimentacao') perfil(C.perfilId()); }, catalogo: catalogo };
})(window);
