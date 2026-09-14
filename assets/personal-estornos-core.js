/* Cancelamentos e devoluções MANUAIS do Personal. Sem chamadas financeiras.
 * Os valores são inteiros em centavos; pagamento original nunca é reescrito.
 * Persistir sempre o objeto lido pelo MTStore, mantendo a proteção CAS. */
(function (root) {
  'use strict';
  var MAX = 100000000000000;
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function lista(st, key) {
    if (st[key] == null) return [];
    if (!Array.isArray(st[key])) throw new Error('Histórico financeiro inválido. Não foi alterado; confira o backup.');
    return st[key];
  }
  function texto(v, min, max, rotulo) {
    var s = String(v == null ? '' : v).trim();
    if (s.length < min || s.length > max) throw new Error(rotulo + ': use de ' + min + ' a ' + max + ' caracteres.');
    return s;
  }
  function centavos(v) {
    var s = String(v == null ? '' : v).trim();
    if (!/^\d{1,13}(?:[.,]\d{1,2})?$/.test(s)) throw new Error('Informe o valor com até duas casas decimais, sem separador de milhares.');
    var p = s.replace(',', '.').split('.'), n = Number(p[0]) * 100 + Number(((p[1] || '') + '00').slice(0, 2));
    if (!Number.isSafeInteger(n) || n <= 0 || n > MAX) throw new Error('O valor deve ser positivo e estar dentro do limite permitido.');
    return n;
  }
  function valorOriginal(p) {
    var v = Number(p && p.valor), n = Math.round(v * 100);
    if (!Number.isFinite(v) || !Number.isSafeInteger(n) || n <= 0 || n > MAX || Math.abs(v * 100 - n) > .00001)
      throw new Error('O recebimento original não possui um valor válido para devolução.');
    return n;
  }
  function diaValido(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s))) return false;
    var d = new Date(s + 'T12:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }
  function metaValida(m) {
    if (!m || !diaValido(m.hoje) || !m.em || !Number.isFinite(Date.parse(m.em))) throw new Error('Data do registro inválida.');
    texto(m.id, 1, 160, 'Identificação da operação'); texto(m.por, 1, 320, 'Responsável');
  }
  function pagamento(st, id) {
    var itens = lista(st, 'pagamentos').filter(function (p) { return p && p.id === id; });
    if (itens.length !== 1) throw new Error('Recebimento não encontrado ou duplicado. Confira o histórico.');
    if (itens[0].anulacao) throw new Error('Um recebimento anulado não pode ser devolvido. Confira o lançamento original.');
    valorOriginal(itens[0]); return itens[0];
  }
  function dePagamento(st, id) { return lista(st, 'estornosPT').filter(function (r) { return r && r.pagamentoId === id; }); }
  function possuiHistorico(st, id) { return dePagamento(st, id).length > 0; }
  function resumo(st, p) {
    var bruto = valorOriginal(p), reservado = 0, devolvido = 0;
    dePagamento(st, p.id).forEach(function (r) {
      if (!Number.isSafeInteger(r.valorCentavos) || r.valorCentavos <= 0 || r.valorCentavos > MAX || r.alunoId !== p.alunoId)
        throw new Error('Histórico de devoluções inconsistente. Nenhuma nova operação foi autorizada.');
      if (r.status === 'pendente') reservado += r.valorCentavos;
      else if (r.status === 'devolvido_manual') devolvido += r.valorCentavos;
      else if (r.status !== 'cancelado') throw new Error('Situação de devolução desconhecida. Confira o histórico.');
    });
    if (reservado + devolvido > bruto) throw new Error('As devoluções registradas ultrapassam o recebimento. Confira o histórico.');
    return { bruto: bruto, pendente: reservado, devolvido: devolvido, disponivel: bruto - reservado - devolvido, liquido: bruto - devolvido };
  }
  function snapshot(st, id) { return JSON.stringify([pagamento(st, id), dePagamento(st, id)]); }
  function verificaBase(st, id, base) {
    if (snapshot(st, id) !== base) throw new Error('Este recebimento ou suas devoluções mudaram em outra sessão. Seu rascunho foi mantido; reabra para conferir.');
  }
  function criaSolicitacao(st, id, base, campos, m) {
    metaValida(m); verificaBase(st, id, base);
    var p = pagamento(st, id), saldo = resumo(st, p), n = centavos(campos.valor);
    if (!p.alunoId || !lista(st, 'alunos').some(function (a) { return a.id === p.alunoId; })) throw new Error('Associe este recebimento a um aluno válido antes de registrar a devolução.');
    if (n > saldo.disponivel) throw new Error('O valor excede o saldo disponível, descontadas as devoluções pendentes e já realizadas.');
    if (lista(st, 'estornosPT').some(function (r) { return r.id === m.id; })) throw new Error('Esta operação já foi registrada. Confira o histórico antes de repetir.');
    var r = { id: m.id, pagamentoId: p.id, alunoId: p.alunoId, valorCentavos: n,
      motivo: texto(campos.motivo, 3, 240, 'Motivo'), status: 'pendente', criadoEm: m.em, criadoPor: m.por,
      pagamentoOriginal: clone(p), eventos: [{ acao: 'solicitar', em: m.em, por: m.por }] };
    st.estornosPT = lista(st, 'estornosPT').concat([r]);
    st.recebimentosRevisao = (+st.recebimentosRevisao || 0) + 1;
    return r;
  }
  function mudaSolicitacao(st, rid, base, acao, campos, m) {
    metaValida(m);
    var rs = lista(st, 'estornosPT'), i = rs.findIndex(function (r) { return r.id === rid; });
    if (i < 0) throw new Error('Devolução não encontrada.');
    var r = rs[i]; verificaBase(st, r.pagamentoId, base);
    if (r.status !== 'pendente') throw new Error('Esta devolução não está mais pendente. O histórico não pode ser reescrito.');
    var p = pagamento(st, r.pagamentoId); resumo(st, p);
    var next = clone(r), evento;
    if (acao === 'confirmar_manual') {
      if (campos.confirmo !== true) throw new Error('Confirme que o dinheiro já foi devolvido por você.');
      if (p.eventoId && campos.confereGateway !== true) throw new Error('Confira também o gateway para evitar uma devolução em duplicidade.');
      if (['pix', 'dinheiro', 'transferencia', 'outro'].indexOf(campos.meio) < 0) throw new Error('Escolha a forma da devolução manual.');
      var dia = String(campos.data || '');
      if (!diaValido(dia) || dia > m.hoje || (diaValido(p.data) && dia < p.data)) throw new Error('A data da devolução não pode ser futura nem anterior ao pagamento.');
      next.status = 'devolvido_manual'; next.data = dia; next.meio = campos.meio;
      next.comprovanteRef = texto(campos.comprovanteRef, 3, 200, 'Referência do comprovante ou recibo');
      next.confirmadoEm = m.em; next.confirmadoPor = m.por;
      evento = { acao: 'confirmar_manual', em: m.em, por: m.por, data: dia, meio: next.meio, comprovanteRef: next.comprovanteRef };
    } else if (acao === 'cancelar_solicitacao') {
      next.status = 'cancelado';
      evento = { acao: 'cancelar_solicitacao', em: m.em, por: m.por, motivo: texto(campos.motivo, 3, 240, 'Motivo da desistência') };
    } else throw new Error('Operação desconhecida. Nenhuma devolução foi executada.');
    next.eventos = (next.eventos || []).concat([evento]); st.estornosPT = rs.slice(); st.estornosPT[i] = next;
    st.recebimentosRevisao = (+st.recebimentosRevisao || 0) + 1;
    return next;
  }
  function movimentos(st) {
    var pagos = lista(st, 'pagamentos').filter(function (p) { return p && !p.anulacao; });
    var porId = new Map(pagos.map(function (p) { return [p.id, p]; }));
    var saidas = lista(st, 'estornosPT').filter(function (r) { return r && r.status === 'devolvido_manual'; }).map(function (r) {
      var p = porId.get(r.pagamentoId);
      if (!p || r.alunoId !== p.alunoId || !diaValido(r.data) || !Number.isSafeInteger(r.valorCentavos) || r.valorCentavos <= 0) return null;
      return { id: 'estorno:' + r.id, alunoId: r.alunoId, pagamentoId: p.id, estornoId: r.id,
        data: r.data, valor: -r.valorCentavos / 100, forma: 'Devolução manual · ' + r.meio,
        tipoRecebimento: p.tipoRecebimento || (p.desc ? 'servico' : 'aulas'), desc: p.desc || 'Devolução de recebimento', movimentoEstorno: true };
    }).filter(Boolean);
    return pagos.concat(saidas);
  }
  function totais(st, de, ate, alunoId) {
    var bruto = 0, devolvido = 0;
    movimentos(st).forEach(function (p) {
      if ((alunoId && p.alunoId !== alunoId) || (de && p.data < de) || (ate && p.data > ate)) return;
      var n = Math.round(Number(p.valor) * 100); if (!Number.isSafeInteger(n)) return;
      if (p.movimentoEstorno) devolvido -= n; else bruto += n;
    });
    return { bruto: bruto / 100, devolvido: devolvido / 100, liquido: (bruto - devolvido) / 100 };
  }
  function snapshotCancelamento(st, alunoId) {
    var a = lista(st, 'alunos').find(function (x) { return x.id === alunoId; });
    if (!a) throw new Error('Aluno não encontrado.');
    return JSON.stringify([a, lista(st, 'contratosPT').filter(function (c) { return c.alunoId === alunoId; }),
      lista(st, 'sessoes').filter(function (s) { return s.alunoId === alunoId; }), lista(st, 'cancelamentosPT').filter(function (c) { return c.alunoId === alunoId; })]);
  }
  function cancelaAtendimento(st, alunoId, base, campos, m) {
    metaValida(m);
    if (snapshotCancelamento(st, alunoId) !== base) throw new Error('O cadastro, contrato ou agenda deste aluno mudou. Reabra para conferir antes de cancelar.');
    var a = lista(st, 'alunos').find(function (x) { return x.id === alunoId; });
    if (a.ativo === false) throw new Error('Este acompanhamento já está encerrado. Você ainda pode registrar uma devolução pelo recebimento.');
    if (a.assinaturaAs || a.assinaturaRec) throw new Error('Cancele primeiro a assinatura automática no bloco de cobrança do aluno e aguarde a confirmação do provedor.');
    if (campos.confereExterno !== true) throw new Error('Confira as cobranças e os agendamentos externos antes de confirmar.');
    if (lista(st, 'cancelamentosPT').some(function (c) { return c.id === m.id; })) throw new Error('Cancelamento já registrado.');
    var motivo = texto(campos.motivo, 3, 240, 'Motivo do cancelamento');
    var hora = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(m.hora || '') ? m.hora : '23:59';
    var futuras = lista(st, 'sessoes').filter(function (s) {
      return s.alunoId === alunoId && !s.feita && !s.faltou && (s.data > m.hoje || (s.data === m.hoje && s.hora && s.hora >= hora));
    });
    var contratos = lista(st, 'contratosPT').filter(function (c) { return c.alunoId === alunoId && c.status === 'ativo'; });
    var registro = { id: m.id, alunoId: alunoId, motivo: motivo, em: m.em, data: m.hoje, por: m.por,
      tipo: 'atendimento', contratosAnteriores: clone(contratos), sessoesCanceladas: clone(futuras),
      pacoteAnterior: clone(a.pacote || null), externoConferido: true };
    // Prepara tudo antes de alterar o estado lido. O pagamento e o seu histórico ficam intactos.
    var mudouAluno = Object.assign({}, a, { ativo: false, fim: m.hoje, cancelamentoPT: m.id });
    if (a.pacote) mudouAluno.pacote = Object.assign({}, a.pacote, { renova: false });
    var futurasSet = new Set(futuras), ids = new Set(contratos.map(function (c) { return c.id; }));
    st.alunos = st.alunos.map(function (x) { return x.id === alunoId ? mudouAluno : x; });
    st.contratosPT = lista(st, 'contratosPT').map(function (c) {
      return c.alunoId === alunoId && ids.has(c.id) ? Object.assign({}, c, { status: 'encerrado', encerradoEm: m.hoje, motivo: 'cancelamento', cancelamentoId: m.id }) : c;
    });
    st.sessoes = lista(st, 'sessoes').filter(function (s) { return !futurasSet.has(s); });
    st.cancelamentosPT = lista(st, 'cancelamentosPT').concat([registro]);
    return registro;
  }
  var api = { centavos: centavos, diaValido: diaValido, resumo: resumo, snapshot: snapshot, dePagamento: dePagamento,
    possuiHistorico: possuiHistorico, criaSolicitacao: criaSolicitacao, mudaSolicitacao: mudaSolicitacao,
    movimentos: movimentos, totais: totais, snapshotCancelamento: snapshotCancelamento, cancelaAtendimento: cancelaAtendimento };
  root.MT_ESTORNOS_CORE = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
