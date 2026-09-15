/* Identidade pública do acompanhamento. Nunca altera login, recebedor Pix,
 * razão social, documentos assinados ou autoria de registros anteriores. */
(function (root) {
  'use strict';
  function texto(v, max) {
    return (typeof v === 'string' ? v : '').replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '')
      .replace(/\s+/g, ' ').trim().slice(0, max);
  }
  function logo(v) {
    return typeof v === 'string' && v.length <= 200 * 1024 && /^data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(v) ? v : '';
  }
  function resolve(cfg) {
    cfg = cfg || {};
    var m = cfg.identidadeMarca || {}, prof = texto(cfg.professor, 120), studio = texto(m.nomeEstudio, 120);
    var modo = ['profissional', 'estudio', 'ambos'].indexOf(m.modo) >= 0 ? m.modo : '';
    // Contas antigas não são renomeadas por inferência. O usuário escolhe a migração.
    if (m.v !== 1 || !modo || (modo !== 'estudio' && !prof) || (modo !== 'profissional' && !studio)) {
      return { v: 1, personalizado: false, modo: 'legado', principal: texto(cfg.nome, 120) || 'Meu Personal', secundario: '', curto: '', slogan: '', profissional: prof, estudio: '' };
    }
    var primeiroProf = modo === 'profissional' || (modo === 'ambos' && m.destaque === 'profissional');
    var principal = primeiroProf ? prof : studio;
    var secundario = modo === 'ambos' && prof !== studio ? (primeiroProf ? studio : 'Treinamento por ' + prof) : '';
    return { v: 1, personalizado: true, modo: modo, principal: principal, secundario: secundario,
      curto: texto(m.nomeCurto, 32) || principal, slogan: texto(m.slogan, 100), profissional: prof, estudio: studio };
  }
  function valida(campos) {
    var c = campos || {}, modo = c.modo;
    if (['profissional', 'estudio', 'ambos'].indexOf(modo) < 0) throw new Error('Escolha como deseja aparecer no app do aluno.');
    var prof = texto(c.profissional, 121), studio = texto(c.nomeEstudio, 121), curto = texto(c.nomeCurto, 33), slogan = texto(c.slogan, 101);
    if (prof.length > 120 || studio.length > 120 || curto.length > 32 || slogan.length > 100) throw new Error('Confira os limites de caracteres dos campos.');
    if (modo !== 'estudio' && !prof) throw new Error('Preencha o nome do profissional para esta opção.');
    if (modo !== 'profissional' && !studio) throw new Error('Preencha o nome do estúdio ou marca para esta opção.');
    if (modo === 'ambos' && ['estudio', 'profissional'].indexOf(c.destaque) < 0) throw new Error('Escolha qual nome terá maior destaque.');
    return { professor: prof, identidadeMarca: { v: 1, modo: modo, destaque: c.destaque === 'profissional' ? 'profissional' : 'estudio', nomeEstudio: studio, nomeCurto: curto, slogan: slogan } };
  }
  function doPacote(d) {
    d = d || {};
    var m = d.identidadeApp;
    if (!m || m.v !== 1 || m.personalizado !== true || ['profissional', 'estudio', 'ambos'].indexOf(m.modo) < 0 || !texto(m.principal, 120)) return resolve({ nome: d.studio });
    // DTO público: sem objetos ou conteúdo HTML, mesmo em pacotes importados.
    return { v: 1, personalizado: true, modo: texto(m.modo, 20), principal: texto(m.principal, 120),
      secundario: texto(m.secundario, 140), curto: texto(m.curto, 120) || texto(m.principal, 120),
      slogan: texto(m.slogan, 100), profissional: texto(m.profissional, 120), estudio: texto(m.estudio, 120) };
  }
  root.MT_IDENTIDADE_MARCA = { resolve: resolve, valida: valida, doPacote: doPacote, texto: texto, logo: logo };
})(typeof self !== 'undefined' ? self : globalThis);
