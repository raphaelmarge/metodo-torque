/* Editor integrado à Personalização; rascunho só vira dado após Salvar.
 * Atualização no app segue a publicação canônica, sem sobrescrever uma ficha em edição. */
(function (root) {
  'use strict';
  var C = root.MT_IDENTIDADE_MARCA, ctx, form, base, conta, dirty = false, salvando = false;
  function el(id) { return document.getElementById(id); }
  function snapshot(cfg) { cfg = cfg || {}; return JSON.stringify([cfg.nome || '', cfg.professor || '', cfg.identidadeMarca || null]); }
  function valores() {
    return { modo: el('marcaModo').value, destaque: el('marcaDestaque').value, profissional: el('marcaProfissional').value,
      nomeEstudio: el('marcaEstudio').value, nomeCurto: el('marcaCurto').value, slogan: el('marcaSlogan').value };
  }
  function aviso(t) { el('marcaStatus').textContent = t; }
  function previa() {
    var cfg = ctx.load().config || {}, v = valores(), modelo;
    try { modelo = C.resolve(Object.assign({}, cfg, C.valida(v))); }
    catch (e) {
      modelo = C.resolve(cfg);
      if (dirty) el('marcaPreviewNota').textContent = e.message;
    }
    if (!dirty || (v.modo && ((v.modo === 'estudio' && v.nomeEstudio.trim()) || (v.modo === 'profissional' && v.profissional.trim()) || (v.nomeEstudio.trim() && v.profissional.trim()))))
      el('marcaPreviewNota').textContent = 'Prévia da identidade. Cores e logo usam sua personalização atual.';
    var cor = /^#[0-9a-f]{6}$/i.test(cfg.cor || '') ? cfg.cor : '#7c3aed';
    el('marcaPreviewPrincipal').closest('.ptmarca-brand').style.background = cor;
    el('marcaPreviewPrincipal').textContent = modelo.principal;
    el('marcaPreviewSecundario').textContent = modelo.secundario;
    el('marcaPreviewSecundario').hidden = !modelo.secundario;
    el('marcaPreviewSlogan').textContent = modelo.slogan;
    el('marcaPreviewSlogan').hidden = !modelo.slogan;
    el('marcaDestaqueCampo').hidden = v.modo !== 'ambos';
    var imagem = C.logo(cfg.logo); el('marcaPreviewLogo').hidden = !imagem;
    if (imagem) el('marcaPreviewLogo').src = imagem; else el('marcaPreviewLogo').removeAttribute('src');
    el('marcaPreviewLogo').alt = modelo.principal;
    el('marcaNomeCurtoPreview').textContent = modelo.curto || modelo.principal;
  }
  function carrega() {
    var cfg = ctx.load().config || {}, m = cfg.identidadeMarca || {};
    conta = ctx.conta(); base = snapshot(cfg); dirty = false;
    el('marcaProfissional').value = C.texto(cfg.professor, 120);
    el('marcaEstudio').value = C.texto(m.nomeEstudio || cfg.nome, 120);
    el('marcaModo').value = m.v === 1 ? m.modo || '' : '';
    el('marcaDestaque').value = m.destaque === 'profissional' ? 'profissional' : 'estudio';
    el('marcaCurto').value = C.texto(m.nomeCurto, 32); el('marcaSlogan').value = C.texto(m.slogan, 100);
    aviso('Seu nome de cadastro, dados fiscais e nome do recebedor não são substituídos pela marca.');
    previa();
  }
  function salva(e) {
    e.preventDefault(); if (salvando) return;
    try {
      if (!ctx.permitido()) throw new Error('Você não tem permissão para alterar a identidade da marca.');
      if (conta !== ctx.conta()) throw new Error('A conta mudou. Recarregue os campos antes de salvar; o rascunho não foi aplicado.');
      var st = ctx.load(), cfg = st.config || {};
      if (snapshot(cfg) !== base) throw new Error('A identidade foi alterada em outra sessão. Seu rascunho foi mantido; recarregue os campos para conferir.');
      var novo = C.valida(valores());
      st.config = Object.assign({}, cfg, novo);
      if (snapshot(st.config) === base) { dirty = false; aviso('Nenhuma alteração na identidade.'); return; }
      st.config.appEditGeralEm = new Date().toISOString();
      (st.alunos || []).forEach(function (a) { if (a.ativo !== false && !a.appRevogadoEm) ctx.marca(st, a.id); });
      salvando = true;
      if (!ctx.save(st)) throw new Error('Não foi possível salvar. Os campos foram mantidos; resolva o aviso de sincronização e tente novamente.');
      base = snapshot(st.config); dirty = false;
      ctx.render();
      aviso('Identidade salva neste painel. Use Publicar, no topo, para atualizar os apps dos alunos.');
    } catch (err) { aviso(err.message || 'Não foi possível salvar a identidade.'); }
    finally { salvando = false; }
  }
  function init(c) {
    if (!C || ctx || !el('marcaForm')) return;
    ctx = c; form = el('marcaForm'); carrega();
    form.addEventListener('input', function () { dirty = true; previa(); });
    form.addEventListener('change', function () { dirty = true; previa(); });
    form.addEventListener('submit', salva);
    el('persPublica').addEventListener('click', function (e) {
      if (!dirty) return; e.preventDefault(); e.stopImmediatePropagation();
      aviso('Salve a identidade antes de publicar. Sua prévia ainda tem alterações não salvas.');
      el('marcaSalvar').focus();
    }, true);
    el('marcaRecarregar').onclick = function () {
      if (dirty && !root.confirm('Descartar os campos não salvos e carregar a identidade atual?')) return;
      carrega();
    };
    el('marcaLogoAtalho').onclick = function () { var b = el('cfgLogoBtn'); if (b) { if (root.MT_FERRAMENTAS) root.MT_FERRAMENTAS.reveal(b); else { b.scrollIntoView({ block: 'center' }); b.focus(); } } };
    ctx.onChange(function (key) {
      if (key !== 'ptStudio' || salvando) return;
      // Em troca de conta, não transplanta o rascunho nem os dados do usuário anterior.
      if (conta !== ctx.conta()) { carrega(); return; }
      if (!dirty) carrega(); else previa();
    });
  }
  root.MT_PERSONAL_MARCA = { init: init, render: function () { if (ctx && !dirty && !salvando) carrega(); }, pendente: function () { return dirty; } };
})(window);
