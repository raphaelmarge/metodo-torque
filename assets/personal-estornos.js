/* Interface integrada ao Financeiro. Não chama gateway nem movimenta dinheiro. */
(function (root) {
  'use strict';
  var C = root.MT_ESTORNOS_CORE, ctx = null;
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function brl(v) { return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
  function data(s) { return C.diaValido(s) ? s.split('-').reverse().join('/') : String(s || '—'); }
  function nome(st, id) { var a = (st.alunos || []).find(function (x) { return x.id === id; }); return a ? a.nome : 'Aluno não disponível'; }
  function ator(s) { try { var a=JSON.parse(s); return Array.isArray(a)?(a[1]==='local'?'Profissional neste aparelho':a[1]):s; } catch(_){return s;} }
  function estado(r) { return { pendente: 'Devolução pendente', devolvido_manual: 'Devolvido manualmente', cancelado: 'Solicitação cancelada' }[r.status] || 'Conferir histórico'; }
  function tipo(p) { return p.eventoId ? 'Pagamento registrado por integração. Este fluxo NÃO estorna o gateway. Confira o provedor antes de registrar uma devolução manual.' : 'O registro não transfere dinheiro. Devolva por fora do app e só depois confirme a devolução realizada.'; }
  function metadados(id) {
    var now = new Date();
    return { id: id, hoje: root.MTStore.todayISO(), hora: now.toTimeString().slice(0, 5), em: now.toISOString(), por: ctx.conta() };
  }
  function verifica(conta) {
    if (!ctx || !ctx.financeiro() || ctx.conta() !== conta) throw new Error('A conta ou permissão mudou. Feche e reabra esta operação.');
  }
  function modal(titulo, html) {
    // Uma operação por vez: não mantém um histórico modal desatualizado atrás da confirmação.
    document.querySelectorAll('dialog.pt-refund-dialog').forEach(function (el) { el.close(); });
    var d = document.createElement('dialog'); d.className = 'pt-refund-dialog';
    d.setAttribute('aria-label', titulo);
    d.innerHTML = '<header><h2>' + esc(titulo) + '</h2><button type="button" class="btn sec" data-fechar aria-label="Fechar">Fechar</button></header>' + html;
    document.body.appendChild(d);
    d.querySelector('[data-fechar]').onclick = function () { d.close(); };
    d.addEventListener('close', function () { d.remove(); }); d.showModal(); return d;
  }
  function formFim(rotulo) {
    return '<p class="pt-refund-save-note">Salvo neste aparelho e sincronizado pelo mecanismo existente da sua conta. Um aviso de pendência não é confirmação de gravação na nuvem.</p>' +
      '<p role="status" aria-live="polite"></p><section class="pt-refund-review" data-revisao hidden><h3>Conferência final</h3><div data-resumo></div>' +
      '<div class="pt-refund-actions"><button type="button" class="btn sec" data-voltar>Voltar</button><button type="button" class="btn" data-confirmar>Confirmar registro</button></div></section>' +
      '<button type="submit" class="btn" data-revisar>' + esc(rotulo) + '</button>';
  }
  // Duas etapas. Cada tentativa relê o objeto do store e revalida conta, permissão e bases.
  function duasEtapas(d, conta, preparar, executar, concluido) {
    var f = d.querySelector('form'), dados = null, busy = false;
    var review = d.querySelector('[data-revisao]'), botao = d.querySelector('[data-revisar]'), status = d.querySelector('[role=status]');
    function voltar() {
      if (busy) return; review.hidden = true; botao.hidden = false; dados = null;
      f.querySelectorAll('fieldset').forEach(function (el) { el.disabled = false; });
    }
    d.querySelector('[data-voltar]').onclick = voltar;
    f.onsubmit = function (e) {
      e.preventDefault(); if (busy) return;
      try {
        verifica(conta); var fields = new FormData(f), st = ctx.load();
        dados = preparar(st, fields); d.querySelector('[data-resumo]').innerHTML = dados.html;
        f.querySelectorAll('fieldset').forEach(function (el) { el.disabled = true; });
        status.textContent = ''; botao.hidden = true; review.hidden = false;
        d.querySelector('[data-confirmar]').focus();
      } catch (err) { status.textContent = err.message; }
    };
    d.querySelector('[data-confirmar]').onclick = function () {
      if (busy || !dados) return; busy = true; this.disabled = true;
      try {
        verifica(conta); var st = ctx.load(), alvo = executar(st, dados);
        // Não clona o painel inteiro: o mesmo objeto lido guarda a revisão CAS.
        if (alvo && alvo.alunoId && ctx.marca) ctx.marca(st, alvo.alunoId);
        if (ctx.save(st) === false) throw new Error('Não foi possível salvar. Seu preenchimento foi mantido. Confira a sincronização e tente novamente.');
        d.close(); if (concluido) concluido(alvo); if (alvo && alvo.alunoId) ctx.perfil(alvo.alunoId);
      } catch (err) { status.textContent = err.message; }
      finally { busy = false; this.disabled = false; }
    };
  }
  function historico(st, p) {
    var rs = C.dePagamento(st, p.id);
    return '<section class="pt-refund-history"><h3>Histórico de devoluções</h3>' + (rs.length ? rs.slice().reverse().map(function (r) {
      return '<article><b>' + brl(r.valorCentavos / 100) + ' · ' + esc(estado(r)) + '</b><p>' + esc(r.motivo) + '</p>' +
        '<small>Solicitada em ' + esc(new Date(r.criadoEm).toLocaleString('pt-BR')) + '</small>' +
        (r.data ? '<p>Devolução informada: ' + esc(data(r.data)) + ' · ' + esc(r.meio) + '<br>Referência: ' + esc(r.comprovanteRef) + '</p>' : '') +
        '<details><summary>Ver trilha do registro</summary>' + (r.eventos || []).map(function (ev) {
          return '<p>' + esc({ solicitar: 'Solicitada', confirmar_manual: 'Devolução manual confirmada pelo profissional', cancelar_solicitacao: 'Solicitação cancelada' }[ev.acao] || ev.acao) + ' · ' + esc(new Date(ev.em).toLocaleString('pt-BR')) + '<br>Responsável: ' + esc(ator(ev.por)) + (ev.motivo ? '<br>' + esc(ev.motivo) : '') + '</p>';
        }).join('') + '</details><div class="pt-refund-actions">' +
        (r.status === 'pendente' ? '<button type="button" class="btn" data-pt-refund-confirm="' + esc(r.id) + '">Já devolvi o dinheiro</button><button type="button" class="btn sec" data-pt-refund-desistir="' + esc(r.id) + '">Cancelar solicitação</button>' : '') +
        (r.status === 'devolvido_manual' ? '<button type="button" class="btn sec" data-pt-refund-recibo="' + esc(r.id) + '">Baixar declaração</button>' : '') + '</div></article>';
    }).join('') : '<p>Nenhuma devolução registrada para este pagamento.</p>') + '</section>';
  }
  function pagamento(id) {
    if (!ctx || !ctx.financeiro()) return;
    var st = ctx.load(), p = (st.pagamentos || []).find(function (x) { return x.id === id; }); if (!p) return;
    try {
      var saldo = C.resumo(st, p), base = C.snapshot(st, id), conta = ctx.conta(), op = root.MTStore.uid();
      var d = modal('Devolução / estorno', '<p><strong>' + esc(nome(st, p.alunoId)) + '</strong> · recebimento de ' + esc(data(p.data)) + '</p>' +
        '<div class="pt-refund-kpis"><span>Pago<b>' + brl(saldo.bruto / 100) + '</b></span><span>Devolvido<b>' + brl(saldo.devolvido / 100) + '</b></span><span>Pendente<b>' + brl(saldo.pendente / 100) + '</b></span><span>Disponível<b>' + brl(saldo.disponivel / 100) + '</b></span></div>' +
        '<p class="pt-refund-warning">' + esc(tipo(p)) + '</p>' + historico(st, p) +
        (saldo.disponivel > 0 && !p.anulacao ? '<form><h3>Registrar devolução pendente</h3><fieldset><label>Valor a devolver (R$)<input name="valor" type="number" step="0.01" min="0.01" max="' + saldo.disponivel / 100 + '" value="' + saldo.disponivel / 100 + '" required></label><label>Motivo<textarea name="motivo" minlength="3" maxlength="240" required></textarea></label></fieldset>' + formFim('Conferir devolução') + '</form>' : '<p>Não há saldo disponível para uma nova devolução.</p>'));
      if (!d.querySelector('form')) return;
      duasEtapas(d, conta, function (s, fd) {
        var campos = { valor: fd.get('valor'), motivo: fd.get('motivo') }, r = C.criaSolicitacao(s, id, base, campos, metadados(op));
        return { campos: campos, html: '<p>Registrar <b>' + brl(r.valorCentavos / 100) + '</b> a devolver para <b>' + esc(nome(s, p.alunoId)) + '</b>.</p><p>' + esc(r.motivo) + '</p><p>Ficará <b>pendente</b>. Nenhum dinheiro será enviado.</p>' };
      }, function (s, d) { return C.criaSolicitacao(s, id, base, d.campos, metadados(op)); });
    } catch (err) { modal('Conferir recebimento', '<p role="alert">' + esc(err.message) + '</p>'); }
  }
  function muda(id, desistir) {
    if (!ctx || !ctx.financeiro()) return;
    var st = ctx.load(), r = (st.estornosPT || []).find(function (x) { return x.id === id; }); if (!r) return;
    try {
      var p = (st.pagamentos || []).find(function (x) { return x.id === r.pagamentoId; }), base = C.snapshot(st, r.pagamentoId), conta = ctx.conta(), op = root.MTStore.uid();
      var d = modal(desistir ? 'Cancelar solicitação de devolução' : 'Registrar devolução já realizada',
        '<p><strong>' + esc(nome(st, r.alunoId)) + '</strong> · <strong>' + brl(r.valorCentavos / 100) + '</strong></p>' +
        '<p class="pt-refund-warning">' + esc(desistir ? 'Isto cancela somente a solicitação pendente; não desfaz uma transferência.' : tipo(p)) + '</p>' +
        '<form><fieldset>' + (desistir ? '<label>Motivo da desistência<textarea name="motivo" minlength="3" maxlength="240" required></textarea></label>' :
          '<label>Data da devolução<input name="data" type="date" required max="' + root.MTStore.todayISO() + '" value="' + root.MTStore.todayISO() + '"></label>' +
          '<label>Forma da devolução<select name="meio"><option value="pix">Pix</option><option value="dinheiro">Dinheiro</option><option value="transferencia">Transferência</option><option value="outro">Outra devolução manual</option></select></label>' +
          '<label>Referência do comprovante ou recibo<input name="comprovanteRef" minlength="3" maxlength="200" required placeholder="Ex.: referência da transferência ou recibo assinado"></label>' +
          '<label class="pt-refund-check"><input type="checkbox" name="confirmo" required> Confirmo que já devolvi este dinheiro ao cliente.</label>' +
          (p.eventoId ? '<label class="pt-refund-check"><input type="checkbox" name="confereGateway" required> Conferi o gateway e a devolução por fora, para não devolver o mesmo valor duas vezes.</label>' : '')) + '</fieldset>' + formFim('Conferir registro') + '</form>');
      var acao = desistir ? 'cancelar_solicitacao' : 'confirmar_manual';
      duasEtapas(d, conta, function (s, fd) {
        var campos = { motivo: fd.get('motivo'), data: fd.get('data'), meio: fd.get('meio'), comprovanteRef: fd.get('comprovanteRef'), confirmo: fd.has('confirmo'), confereGateway: fd.has('confereGateway') };
        var next = C.mudaSolicitacao(s, id, base, acao, campos, metadados(op));
        return { campos: campos, html: '<p>' + (desistir ? 'Cancelar a solicitação de ' : 'Registrar como devolvido manualmente: ') + '<b>' + brl(next.valorCentavos / 100) + '</b> para <b>' + esc(nome(s, r.alunoId)) + '</b>.</p>' +
          (desistir ? '' : '<p>Data: ' + esc(data(next.data)) + ' · ' + esc(next.meio) + '<br>Referência: ' + esc(next.comprovanteRef) + '</p><p>Este registro não poderá ser editado pela interface. Ele é uma declaração sua, não uma confirmação bancária.</p>') };
      }, function (s, d) { return C.mudaSolicitacao(s, id, base, acao, d.campos, metadados(op)); });
    } catch (err) { modal('Conferir devolução', '<p role="alert">' + esc(err.message) + '</p>'); }
  }
  function cancelar(alunoId) {
    if (!ctx || !ctx.financeiro()) return;
    var st = ctx.load(), a = (st.alunos || []).find(function (x) { return x.id === alunoId; }); if (!a) return;
    var conta = ctx.conta(), base, op = root.MTStore.uid();
    try { base = C.snapshotCancelamento(st, alunoId); } catch (err) { modal('Conferir cadastro', '<p role="alert">' + esc(err.message) + '</p>'); return; }
    if (a.assinaturaAs || a.assinaturaRec) {
      var bloqueado = modal('Assinatura automática ainda vinculada', '<p>Cancele primeiro a assinatura na área de cobrança deste aluno e aguarde a confirmação do provedor. Cancelar aqui não pode deixar o cartão sendo cobrado.</p><button class="btn" type="button" data-cobranca>Abrir cobrança do aluno</button>');
      bloqueado.querySelector('[data-cobranca]').onclick = function () { bloqueado.close(); ctx.assinatura(alunoId); }; return;
    }
    var pags = (st.pagamentos || []).filter(function (p) { return p.alunoId === alunoId && !p.anulacao; }), bases = {};
    var opts = pags.map(function (p) { try { var s = C.resumo(st, p); bases[p.id] = C.snapshot(st, p.id); return s.disponivel > 0 ? '<option value="' + esc(p.id) + '">' + esc(data(p.data)) + ' · ' + brl(s.disponivel / 100) + ' disponíveis</option>' : ''; } catch (_) { return ''; } }).join('');
    var d = modal('Cancelar atendimento', '<p><strong>' + esc(a.nome) + '</strong></p><p>Encerra o acompanhamento no painel e os contratos ativos. As sessões futuras ainda não realizadas saem da agenda ativa e ficam arquivadas no histórico deste cancelamento. Treinos, avaliações, recebimentos e aulas realizadas são preservados.</p>' +
      '<p class="pt-refund-warning">Não revoga o acesso ao app, não cancela cobranças já emitidas, links de pagamento ou agendamentos em sistemas externos. Nenhum dinheiro será devolvido automaticamente.</p>' +
      '<form><fieldset><label>Motivo<textarea name="motivo" minlength="3" maxlength="240" required></textarea></label><label>Devolução vinculada<select name="pagamento"><option value="">Sem registrar devolução agora</option>' + opts + '</select></label><label>Valor a devolver (R$, se selecionou um recebimento)<input name="valor" type="number" min="0.01" step="0.01"></label><label class="pt-refund-check"><input type="checkbox" name="confereExterno" required> Conferi cobranças, links e agendamentos externos e estou ciente de que esta ação cancela o atendimento no painel.</label></fieldset>' + formFim('Conferir cancelamento') + '</form>');
    function prepara(s, campos) {
      var r = C.cancelaAtendimento(s, alunoId, base, campos, metadados(op));
      if (campos.pagamento) {
        C.criaSolicitacao(s, campos.pagamento, bases[campos.pagamento], { valor: campos.valor, motivo: campos.motivo }, metadados(op + '-dev'));
        r.estornoId = op + '-dev';
      }
      return r;
    }
    duasEtapas(d, conta, function (s, fd) {
      var campos = { motivo: fd.get('motivo'), pagamento: fd.get('pagamento'), valor: fd.get('valor'), confereExterno: fd.has('confereExterno') }, r = prepara(s, campos);
      return { campos: campos, html: '<p>Cancelar o atendimento de <b>' + esc(a.nome) + '</b>.</p><p>' + r.contratosAnteriores.length + ' contrato(s) encerrado(s); ' + r.sessoesCanceladas.length + ' sessão(ões) futura(s) arquivada(s).</p><p>' + esc(r.motivo) + '</p>' + (r.estornoId ? '<p>Devolução de <b>' + brl(C.centavos(campos.valor) / 100) + '</b> ficará <b>pendente</b>, até você confirmar que devolveu por fora do app.</p>' : '<p>Sem devolução financeira neste registro.</p>') };
    }, function (s, d) { return prepara(s, d.campos); });
  }
  function declaracao(id) {
    if (!ctx || !ctx.financeiro()) return;
    var st = ctx.load(), r = (st.estornosPT || []).find(function (x) { return x.id === id && x.status === 'devolvido_manual'; }); if (!r) return;
    var html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;"><title>Declaração de devolução manual</title><style>body{font:16px/1.6 system-ui;max-width:720px;margin:40px auto;padding:24px;color:#171717}h1{font-size:26px}small{display:block;margin-top:32px}dt{font-weight:bold}dd{margin:0 0 16px;overflow-wrap:anywhere}@media print{body{margin:0}}</style><h1>Declaração de devolução manual</h1><p>' + esc((st.config || {}).nome || 'TORQUE PERSONAL') + '</p><dl>' +
      [['Cliente', nome(st, r.alunoId)], ['Valor informado como devolvido', brl(r.valorCentavos / 100)], ['Data da devolução', data(r.data)], ['Meio', r.meio], ['Motivo', r.motivo], ['Referência do comprovante', r.comprovanteRef], ['Recebimento original', data(r.pagamentoOriginal.data) + ' · ' + brl(r.pagamentoOriginal.valor)], ['Registrado por', ator(r.confirmadoPor)], ['Registro', r.id]].map(function (x) { return '<dt>' + esc(x[0]) + '</dt><dd>' + esc(x[1]) + '</dd>'; }).join('') +
      '</dl><small>Registro administrativo informado pelo profissional. Não é comprovante bancário nem confirmação de estorno de cartão. Nenhuma transferência foi executada pelo TORQUE PERSONAL. Guarde o comprovante original do meio utilizado.</small></html>';
    var blob = new Blob([html], { type: 'text/html;charset=utf-8' }), url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'declaracao-devolucao-' + r.data + '.html'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function htmlPagamento(st, p, permitido) {
    if (!p || p.anulacao) return '';
    try {
      var s = C.resumo(st, p), rot = s.devolvido ? (s.devolvido === s.bruto ? 'Devolução total registrada' : 'Devolução parcial registrada') : '';
      return (rot ? '<span class="tag">' + rot + ' · ' + brl(s.devolvido / 100) + '</span>' : '') + (s.pendente ? '<span class="tag alerta">' + brl(s.pendente / 100) + ' a devolver</span>' : '') +
        (permitido && p.alunoId ? '<button type="button" class="btn sec mini" data-pt-estorno="' + esc(p.id) + '">Devolução / estorno</button>' : '');
    } catch (_) { return '<span class="tag alerta">Conferir histórico de devoluções</span>'; }
  }
  function htmlAluno(st, a, permitido) {
    if (!permitido) return '';
    var cs = (st.cancelamentosPT || []).filter(function (c) { return c.alunoId === a.id; }), rs = (st.estornosPT || []).filter(function (r) { return r.alunoId === a.id; });
    return '<section class="pt-refund-panel"><h3>Cancelamento e devoluções</h3><p>Cancelar o atendimento não apaga o pagamento original nem devolve dinheiro automaticamente.</p>' +
      (a.ativo !== false ? '<button type="button" class="btn sec" data-pt-cancelar="' + esc(a.id) + '">Cancelar atendimento</button>' : '<p><b>Atendimento encerrado</b>. Os registros financeiros continuam disponíveis.</p>') +
      (rs.length ? '<div class="pt-refund-ledger">' + rs.slice().reverse().map(function (r) { return '<p><b>' + brl(r.valorCentavos / 100) + ' · ' + esc(estado(r)) + '</b> <button class="btn sec mini" type="button" data-pt-estorno="' + esc(r.pagamentoId) + '">Ver devolução</button></p>'; }).join('') + '</div>' : '') +
      cs.map(function (c) { return '<details><summary>Cancelamento de ' + esc(data(c.data)) + '</summary><p>' + esc(c.motivo) + '<br>Responsável: ' + esc(ator(c.por)) + '</p><p>' + (c.contratosAnteriores || []).length + ' contrato(s) encerrado(s). Sessões arquivadas:</p>' + (c.sessoesCanceladas || []).map(function (s) { return '<p>' + esc(data(s.data)) + ' · ' + esc(s.hora || 'Sem horário') + '</p>'; }).join('') + '</details>'; }).join('') + '</section>';
  }
  function htmlTotais(st, mes) {
    var t = C.totais(st, mes + '-01', mes + '-31');
    return '<section class="pt-refund-panel"><h3>Movimento financeiro do mês</h3><div class="pt-refund-kpis"><span>Recebimentos brutos<b>' + brl(t.bruto) + '</b></span><span>Devoluções manuais<b>' + brl(t.devolvido) + '</b></span><span>Após devoluções<b>' + brl(t.liquido) + '</b></span></div><p>Saídas consideradas na data informada da devolução. Solicitações pendentes não reduzem o caixa. Cancelamento, devolução e anulação são operações diferentes.</p></section>';
  }
  root.MT_ESTORNOS = { init: function (c) {
    ctx = c; document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-pt-estorno],[data-pt-cancelar],[data-pt-refund-confirm],[data-pt-refund-desistir],[data-pt-refund-recibo]');
      if (!b || !ctx.financeiro()) return; e.preventDefault();
      if (b.hasAttribute('data-pt-estorno')) pagamento(b.dataset.ptEstorno);
      else if (b.hasAttribute('data-pt-cancelar')) cancelar(b.dataset.ptCancelar);
      else if (b.hasAttribute('data-pt-refund-recibo')) declaracao(b.dataset.ptRefundRecibo);
      else { var parent = b.closest('dialog'); if (parent) parent.close(); muda(b.dataset.ptRefundConfirm || b.dataset.ptRefundDesistir, b.hasAttribute('data-pt-refund-desistir')); }
    });
  }, htmlPagamento: htmlPagamento, htmlAluno: htmlAluno, htmlTotais: htmlTotais };
})(typeof self !== 'undefined' ? self : globalThis);
