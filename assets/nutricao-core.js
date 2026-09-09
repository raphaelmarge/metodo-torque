/* Contrato compartilhado de alimentação. A fábrica é autocontida para o app offline. */
(function (root) {
  'use strict';
  function runtime() {
    'use strict';
    function txt(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }
    function numero(v) { if (v === '' || v == null || typeof v === 'boolean') return null; var n = Number(String(v).replace(',', '.')); return Number.isFinite(n) && n >= 0 ? n : null; }
    function lista(v) { return Array.isArray(v) ? v : []; }
    function normalizaItem(it) {
      if (!it || typeof it !== 'object') return null;
      var qtd = numero(it.qtd), nome = txt(it.nome, 200), k = numero(it.k), pt = numero(it.pt), cb = numero(it.cb), g = numero(it.g);
      if (!nome || qtd === null || qtd <= 0 || qtd > 1000 || k === null || pt === null || cb === null || g === null) return null;
      if ([k, pt, cb, g].some(function (v) { return v > 100000; })) return null;
      return { id: txt(it.id, 100), alimId: txt(it.alimId, 250), nome: nome, porcao: txt(it.porcao, 100), qtd: qtd, k: k, pt: pt, cb: cb, g: g };
    }
    function totalItens(itens) {
      var total = { k: 0, pt: 0, cb: 0, g: 0 };
      lista(itens).forEach(function (it) { it = normalizaItem(it); if (!it) return; ['k','pt','cb','g'].forEach(function (key) { total[key] += it[key] * it.qtd; }); });
      return total;
    }
    function hora(v) { v = txt(v, 5); return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : ''; }
    function normalizaPlano(p) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
      return { v: 1, ativo: p.ativo !== false, id: txt(p.id, 100), atualizadoEm: txt(p.atualizadoEm, 40), titulo: txt(p.titulo, 160), objetivo: txt(p.objetivo, 300), orientacoes: txt(p.orientacoes, 6000), responsavel: txt(p.responsavel, 160), crn: txt(p.crn, 80),
        refeicoes: lista(p.refeicoes).slice(0, 30).filter(function (r) { return r && typeof r === 'object'; }).map(function (r) {
          return { id: txt(r.id, 100), hora: hora(r.hora), titulo: txt(r.titulo, 120), itens: lista(r.itens).slice(0, 100).map(normalizaItem).filter(Boolean) };
        }) };
    }
    function dia(v) { var s = txt(v, 10), m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return ''; var d = new Date(+m[1], +m[2] - 1, +m[3], 12); return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? s : ''; }
    function normalizaRegistro(r) {
      if (!r || typeof r !== 'object' || !/^[A-Za-z0-9:_-]{1,300}$/.test(String(r.id || '')) || ['__proto__','constructor','prototype'].indexOf(r.id) >= 0 || !dia(r.d)) return null;
      var stamp = txt(r.atualizadoEm, 40);
      if (!Number.isFinite(Date.parse(stamp))) return null;
      var foto = String(r.foto || '');
      if (foto.length > 60000 || (foto && !/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(foto))) return null;
      return { id: txt(r.id, 300), d: dia(r.d), refeicaoId: txt(r.refeicaoId, 100), titulo: txt(r.titulo, 120), hora: hora(r.hora), itens: lista(r.itens).slice(0, 100).map(normalizaItem).filter(Boolean), origem: ['plano','manual','foto'].indexOf(r.origem) >= 0 ? r.origem : 'manual', foto: txt(r.foto, 60000), atualizadoEm: stamp, apagado: !!r.apagado, estimativa: !!r.estimativa, observacao: txt(r.observacao, 2000) };
    }
    return { normalizaPlano: normalizaPlano, totalItens: totalItens, normalizaRegistro: normalizaRegistro, normalizaItem: normalizaItem };
  }
  root.MT_NUTRICAO = runtime();
  root.MT_NUTRICAO.runtime = runtime;
})(typeof self !== 'undefined' ? self : globalThis);
