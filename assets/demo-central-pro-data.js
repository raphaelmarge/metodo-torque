/* Central Pro — dados fictícios v831, exclusivos da demonstração.
 * Implementa somente o contrato usado por personal-pro-suite.js.
 * As oito coleções vivem nesta closure e desaparecem ao recarregar a página.
 */
(function () {
  'use strict';
  var academia = 'demo-academia', profissional = 'demo-prof-marina', sequencia = 0;
  var alunos = [
    { id: 'demo-ana', nome: 'Ana Beatriz Souza' },
    { id: 'demo-bruno', nome: 'Bruno Ferraz' },
    { id: 'demo-carla', nome: 'Carla Menezes' }
  ];
  var gatilhos = ['questionario.respondido', 'aluno.novo', 'agenda.cancelada'];
  var acoes = ['revisar_aluno', 'contatar_aluno', 'revisar_planejamento'];
  var campos = {
    membros: 'academia_id,user_id,papel,nome,email',
    personal_importacoes: 'id,academia_id,autor_id,aluno_id,origem,nome_arquivo,status,dados,criado_em,atualizado_em',
    personal_sessoes: 'id,academia_id,aluno_id,profissional_id,status,dados,iniciado_em,encerrado_em',
    personal_automacoes: 'id,academia_id,autor_id,nome,gatilho,condicao,acao,ativa,criado_em,atualizado_em',
    personal_automacao_fila: 'id,academia_id,automacao_id,aluno_id,gatilho,acao,origem,status,criado_em,concluido_em',
    personal_lista_espera: 'id,academia_id,aluno_id,dia,hora,status,criado_em,atualizado_em',
    personal_creditos: 'academia_id,aluno_id,saldo,atualizado_em',
    personal_aluno_equipe: 'academia_id,aluno_id,responsavel_id,substituto_id,atualizado_em'
  };
  var chaves = {
    membros: [['academia_id', 'user_id']],
    personal_importacoes: [['id']], personal_sessoes: [['id']],
    personal_automacoes: [['id']], personal_automacao_fila: [['id']],
    personal_lista_espera: [['id'], ['academia_id', 'aluno_id', 'dia', 'hora']],
    personal_creditos: [['academia_id', 'aluno_id']],
    personal_aluno_equipe: [['academia_id', 'aluno_id']]
  };
  Object.keys(campos).forEach(function (t) { campos[t] = campos[t].split(','); });
  function copia(v) { return JSON.parse(JSON.stringify(v)); }
  function tem(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function objeto(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function exige(ok, mensagem) { if (!ok) throw new Error(mensagem); }
  function texto(v, max) { return typeof v === 'string' && v.trim().length > 0 && v.length <= max; }
  function resultado(data) { return { data: copia(data), error: null, count: Array.isArray(data) ? data.length : 1 }; }
  function erro(e) { return { data: null, error: { message: e.message || String(e), code: 'DEMO_VALIDATION' }, count: 0 }; }
  function id() { sequencia++; return 'demo-registro-' + String(sequencia).padStart(5, '0'); }
  function dataOffset(n) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  var carimbo = dataOffset(0) + 'T12:00:00.000Z';
  var tabelas = {
    membros: [
      { academia_id: academia, user_id: profissional, papel: 'dono', nome: 'Marina Costa', email: 'marina@example.invalid' },
      { academia_id: academia, user_id: 'demo-prof-rafael', papel: 'personal', nome: 'Rafael Lima', email: 'rafael@example.invalid' }
    ],
    personal_importacoes: [],
    personal_sessoes: [],
    personal_automacoes: [
      { id: 'demo-regra-questionario', academia_id: academia, autor_id: profissional, nome: 'Revisar resposta do aluno · Demo', gatilho: 'questionario.respondido', condicao: {}, acao: { tipo: 'revisar_aluno' }, ativa: true, criado_em: carimbo, atualizado_em: carimbo },
      { id: 'demo-regra-boas-vindas', academia_id: academia, autor_id: profissional, nome: 'Preparar boas-vindas · Demo', gatilho: 'aluno.novo', condicao: {}, acao: { tipo: 'contatar_aluno' }, ativa: true, criado_em: carimbo, atualizado_em: carimbo },
      { id: 'demo-regra-agenda', academia_id: academia, autor_id: profissional, nome: 'Reorganizar sessão cancelada · Demo', gatilho: 'agenda.cancelada', condicao: {}, acao: { tipo: 'revisar_planejamento' }, ativa: true, criado_em: carimbo, atualizado_em: carimbo },
      { id: 'demo-regra-pausada', academia_id: academia, autor_id: profissional, nome: 'Contato adicional · Demo pausada', gatilho: 'questionario.respondido', condicao: {}, acao: { tipo: 'contatar_aluno' }, ativa: false, criado_em: carimbo, atualizado_em: carimbo }
    ],
    personal_automacao_fila: [
      { id: 'demo-fila-ana', academia_id: academia, automacao_id: 'demo-regra-questionario', aluno_id: 'demo-ana', gatilho: 'questionario.respondido', acao: { tipo: 'revisar_aluno' }, origem: { demonstracao: true, rotulo: 'Exemplo do demo' }, status: 'pendente', criado_em: carimbo, concluido_em: null },
      { id: 'demo-fila-bruno', academia_id: academia, automacao_id: 'demo-regra-agenda', aluno_id: 'demo-bruno', gatilho: 'agenda.cancelada', acao: { tipo: 'revisar_planejamento' }, origem: { demonstracao: true, rotulo: 'Exemplo do demo' }, status: 'pendente', criado_em: carimbo, concluido_em: null }
    ],
    personal_lista_espera: [
      { id: 'demo-espera-ana', academia_id: academia, aluno_id: 'demo-ana', dia: dataOffset(1), hora: '18:00:00', status: 'aguardando', criado_em: carimbo, atualizado_em: carimbo },
      { id: 'demo-espera-bruno', academia_id: academia, aluno_id: 'demo-bruno', dia: dataOffset(1), hora: '19:00:00', status: 'aguardando', criado_em: carimbo, atualizado_em: carimbo },
      { id: 'demo-espera-carla', academia_id: academia, aluno_id: 'demo-carla', dia: dataOffset(2), hora: '08:00:00', status: 'aguardando', criado_em: carimbo, atualizado_em: carimbo }
    ],
    personal_creditos: alunos.map(function (a, i) { return { academia_id: academia, aluno_id: a.id, saldo: [8, 3, 5][i], atualizado_em: carimbo }; }),
    personal_aluno_equipe: alunos.map(function (a, i) { return { academia_id: academia, aluno_id: a.id, responsavel_id: i === 1 ? 'demo-prof-rafael' : profissional, substituto_id: i === 1 ? profissional : 'demo-prof-rafael', atualizado_em: carimbo }; })
  };
  function coluna(t, c) { exige(tem(campos, t), 'Tabela indisponível nesta demonstração.'); exige(campos[t].indexOf(c) >= 0, 'Campo desconhecido no demo: ' + String(c)); }
  function conhecidoAluno(v) { return alunos.some(function (a) { return a.id === v; }); }
  function membro(v) { return tabelas.membros.some(function (m) { return m.user_id === v; }); }
  function valida(t, r) {
    exige(objeto(r), 'Informe um registro válido.');
    Object.keys(r).forEach(function (c) { coluna(t, c); });
    exige(r.academia_id === academia, 'Use a academia fictícia desta demonstração.');
    if (campos[t].indexOf('id') >= 0) exige(texto(r.id, 160), 'Identificador inválido.');
    if (campos[t].indexOf('aluno_id') >= 0) exige(conhecidoAluno(r.aluno_id) || ((t === 'personal_importacoes' || t === 'personal_automacao_fila') && r.aluno_id === null), 'Escolha um dos três alunos do demo.');
    ['autor_id', 'profissional_id', 'responsavel_id'].forEach(function (c) { if (campos[t].indexOf(c) >= 0) exige(membro(r[c]), 'Profissional indisponível nesta demonstração.'); });
    ['dados', 'acao', 'condicao', 'origem'].forEach(function (c) { if (campos[t].indexOf(c) >= 0 && !(c === 'origem' && t === 'personal_importacoes')) exige(objeto(r[c]), 'O campo ' + c + ' precisa ser um objeto.'); });
    ['criado_em', 'atualizado_em', 'iniciado_em', 'encerrado_em', 'concluido_em'].forEach(function (c) {
      if (campos[t].indexOf(c) < 0) return;
      var opcional = c === 'encerrado_em' || c === 'concluido_em';
      exige(opcional && r[c] === null || typeof r[c] === 'string' && Number.isFinite(Date.parse(r[c])), 'Data inválida em ' + c + '.');
    });
    var statusPermitidos = {
      personal_importacoes: ['revisar', 'aprovada', 'descartada'],
      personal_sessoes: ['em_andamento', 'concluida', 'cancelada'],
      personal_automacao_fila: ['pendente', 'concluida', 'ignorada'],
      personal_lista_espera: ['aguardando', 'ofertada', 'confirmada', 'cancelada']
    };
    if (tem(statusPermitidos, t)) exige(statusPermitidos[t].indexOf(r.status) >= 0, 'Estado inválido para este registro.');
    if (t === 'personal_importacoes') {
      exige(['csv', 'json', 'txt', 'xlsx', 'xls', 'pdf', 'arquivo'].indexOf(r.origem) >= 0, 'Formato de importação inválido.');
      exige(typeof r.nome_arquivo === 'string', 'Nome de arquivo inválido.');
      exige(Array.isArray(r.dados.linhas) && r.dados.linhas.length > 0, 'A importação precisa ter linhas para revisão.');
    }
    if (t === 'personal_sessoes') {
      exige(Array.isArray(r.dados.series), 'As séries precisam ser uma lista.');
      exige(JSON.stringify(r.dados).length <= 250000, 'O registro da sessão excede o limite do demo.');
      exige(r.status !== 'concluida' || r.encerrado_em !== null, 'Informe o encerramento da sessão.');
    }
    if (t === 'personal_automacoes' || t === 'personal_automacao_fila') {
      exige(gatilhos.indexOf(r.gatilho) >= 0, 'Gatilho desconhecido no demo.');
      exige(acoes.indexOf(r.acao.tipo) >= 0, 'Escolha uma ação disponível na Central Pro.');
    }
    if (t === 'personal_automacoes') { exige(texto(r.nome, 160), 'Dê um nome de até 160 caracteres à automação.'); exige(typeof r.ativa === 'boolean', 'Ativa precisa ser verdadeiro ou falso.'); }
    if (t === 'personal_automacao_fila') exige(tabelas.personal_automacoes.some(function (a) { return a.id === r.automacao_id; }), 'Automação de origem não encontrada.');
    if (t === 'personal_lista_espera') {
      exige(typeof r.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.dia) && !isNaN(Date.parse(r.dia)) && new Date(r.dia + 'T12:00:00Z').toISOString().slice(0, 10) === r.dia, 'Informe uma data válida.');
      exige(typeof r.hora === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(r.hora), 'Informe um horário válido.');
      if (r.hora.length === 5) r.hora += ':00';
    }
    if (t === 'personal_creditos') exige(Number.isSafeInteger(r.saldo) && r.saldo >= 0, 'O saldo precisa ser um número inteiro maior ou igual a zero.');
    if (t === 'personal_aluno_equipe') exige(r.substituto_id === null || membro(r.substituto_id) && r.substituto_id !== r.responsavel_id, 'Escolha um substituto diferente do responsável.');
  }
  function novo(t, v) {
    var r = {}, agora = new Date().toISOString();
    if (campos[t].indexOf('id') >= 0) r.id = id();
    ['criado_em', 'atualizado_em', 'iniciado_em'].forEach(function (c) { if (campos[t].indexOf(c) >= 0) r[c] = agora; });
    if (t === 'personal_importacoes') Object.assign(r, { aluno_id: null, nome_arquivo: '', status: 'revisar', dados: {} });
    if (t === 'personal_sessoes') Object.assign(r, { status: 'em_andamento', encerrado_em: null, dados: { series: [] } });
    if (t === 'personal_automacoes') Object.assign(r, { condicao: {}, acao: {}, ativa: true });
    if (t === 'personal_automacao_fila') Object.assign(r, { aluno_id: null, acao: {}, origem: {}, status: 'pendente', concluido_em: null });
    if (t === 'personal_lista_espera') r.status = 'aguardando';
    if (t === 'personal_creditos') r.saldo = 0;
    if (t === 'personal_aluno_equipe') r.substituto_id = null;
    return Object.assign(r, v);
  }
  function mesmas(a, b, ks) { return ks.every(function (k) { return a[k] === b[k]; }); }
  function validaUnicos(t, rows) {
    chaves[t].forEach(function (ks) { rows.forEach(function (r, i) { exige(!rows.slice(0, i).some(function (p) { return mesmas(r, p, ks); }), 'Este registro já existe no demo.'); }); });
  }
  function consulta(t) {
    var operacao = 'select', payload, conflitos, filtros = [], ordens = [], limite = null, selecao = null, um = false, falha = null, executada = null;
    function tenta(fn) { if (executada) throw new Error('Esta consulta do demo já foi executada.'); if (!falha) { try { fn(); } catch (e) { falha = e; } } return api; }
    function escrita(op, valor, opts) {
      return tenta(function () {
        exige(tem(campos, t) && t !== 'membros', 'Esta tabela não permite gravações no demo.');
        exige(operacao === 'select', 'Use uma operação por consulta.');
        var lista = Array.isArray(valor) ? valor : [valor];
        exige(lista.length > 0 && lista.every(objeto), 'Informe pelo menos um registro válido.');
        exige(op !== 'update' || !Array.isArray(valor), 'Atualize com um objeto.');
        lista.forEach(function (r) { exige(Object.keys(r).length > 0, 'O registro não pode estar vazio.'); Object.keys(r).forEach(function (c) { coluna(t, c); }); });
        payload = copia(lista); operacao = op;
        if (op === 'upsert') {
          conflitos = opts && opts.onConflict ? String(opts.onConflict).split(',').map(function (c) { return c.trim(); }) : chaves[t][0];
          exige(chaves[t].some(function (ks) { return ks.length === conflitos.length && ks.every(function (k) { return conflitos.indexOf(k) >= 0; }); }), 'Chave de atualização inválida no demo.');
          payload.forEach(function (r) { exige(conflitos.every(function (k) { return tem(r, k) && r[k] !== null; }), 'Informe todos os campos da chave de atualização.'); });
        }
      });
    }
    function aceita(r) { return filtros.every(function (f) { return r[f[0]] === f[1]; }); }
    function projeta(r) { if (!selecao) return copia(r); var p = {}; selecao.forEach(function (c) { p[c] = copia(r[c] === undefined ? null : r[c]); }); return p; }
    function executa() {
      try {
        if (falha) throw falha;
        exige(tem(tabelas, t), 'Tabela indisponível nesta demonstração.');
        var atuais = tabelas[t], proximas = copia(atuais), achadas = [];
        if (operacao === 'select') achadas = atuais.filter(aceita);
        else if (operacao === 'update') {
          exige(filtros.length > 0, 'Escolha o registro que deseja atualizar.');
          proximas.forEach(function (r, i) { if (aceita(r)) { var atualizado = Object.assign({}, r, payload[0]); valida(t, atualizado); proximas[i] = atualizado; achadas.push(atualizado); } });
          exige(achadas.length > 0, 'Nenhum registro encontrado para atualizar.');
        } else {
          exige(!filtros.length, 'Filtros de gravação são usados somente em atualizações neste demo.');
          payload.forEach(function (v) {
            // A chave de espera usa o horário normalizado, como na leitura.
            if (t === 'personal_lista_espera' && typeof v.hora === 'string' && /^\d{2}:\d{2}$/.test(v.hora)) v.hora += ':00';
            var index = operacao === 'upsert' ? proximas.findIndex(function (r) { return mesmas(r, v, conflitos); }) : -1;
            var row = index >= 0 ? Object.assign({}, proximas[index], v) : novo(t, v);
            valida(t, row); if (index >= 0) proximas[index] = row; else proximas.push(row); achadas.push(row);
          });
        }
        if (operacao !== 'select') validaUnicos(t, proximas);
        if (ordens.length) achadas = achadas.slice().sort(function (a, b) {
          for (var i = 0; i < ordens.length; i++) { var o = ordens[i], x = a[o.campo], y = b[o.campo]; if (x === y) continue; var d = x == null ? 1 : y == null ? -1 : typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'pt-BR'); return o.asc ? d : -d; }
          return 0;
        });
        if (limite !== null) achadas = achadas.slice(0, limite);
        exige(!um || achadas.length === 1, 'A consulta precisa encontrar exatamente um registro.');
        var saida = resultado(um ? projeta(achadas[0]) : achadas.map(projeta));
        if (operacao !== 'select') tabelas[t] = proximas; // só confirma após validar o lote inteiro
        return saida;
      } catch (e) { return erro(e); }
    }
    var api = {
      select: function (cs) { return tenta(function () { exige(tem(campos, t), 'Tabela indisponível nesta demonstração.'); exige(cs === undefined || typeof cs === 'string', 'Seleção de campos inválida.'); if (cs && cs !== '*') { selecao = cs.split(',').map(function (c) { return c.trim(); }); selecao.forEach(function (c) { coluna(t, c); }); } else selecao = null; }); },
      eq: function (c, v) { return tenta(function () { coluna(t, c); exige(v === null || ['string', 'boolean', 'number'].indexOf(typeof v) >= 0 && (typeof v !== 'number' || Number.isFinite(v)), 'Valor de filtro inválido.'); filtros.push([c, v]); }); },
      order: function (c, opts) { return tenta(function () { coluna(t, c); exige(!opts || opts.ascending === undefined || typeof opts.ascending === 'boolean', 'Ordenação inválida.'); ordens.push({ campo: c, asc: !opts || opts.ascending !== false }); }); },
      limit: function (n) { return tenta(function () { exige(Number.isSafeInteger(n) && n >= 0, 'Limite inválido.'); limite = n; }); },
      insert: function (v) { return escrita('insert', v); },
      update: function (v) { return escrita('update', v); },
      upsert: function (v, opts) { return escrita('upsert', v, opts); },
      single: function () { return tenta(function () { um = true; }); },
      then: function (resolve, reject) { if (!executada) executada = Promise.resolve().then(executa); return executada.then(resolve, reject); }
    };
    return api;
  }
  var client = {
    auth: { getSession: function () { return Promise.resolve({ data: { session: { user: { id: profissional, email: 'marina@example.invalid' } } }, error: null }); } },
    from: consulta
  };
  function simulate(gatilho, alunoId) {
    return Promise.resolve().then(function () {
      try {
        exige(gatilhos.indexOf(gatilho) >= 0, 'Escolha um dos eventos disponíveis no demo.');
        exige(conhecidoAluno(alunoId), 'Escolha um dos três alunos do demo.');
        var regras = tabelas.personal_automacoes.filter(function (a) { return a.ativa && a.gatilho === gatilho; });
        exige(regras.length > 0, 'Nenhuma automação ativa corresponde a este evento.');
        var evento = id(), rows = regras.map(function (a) {
          return novo('personal_automacao_fila', { academia_id: academia, automacao_id: a.id, aluno_id: alunoId, gatilho: gatilho, acao: copia(a.acao), origem: { demonstracao: true, rotulo: 'Simulação do demo', evento_id: evento, evento: gatilho } });
        });
        rows.forEach(function (r) { valida('personal_automacao_fila', r); });
        var proximas = tabelas.personal_automacao_fila.concat(rows);
        validaUnicos('personal_automacao_fila', proximas);
        tabelas.personal_automacao_fila = proximas;
        return resultado(rows);
      } catch (e) { return erro(e); }
    });
  }
  window.MT_CENTRAL_PRO_DEMO = Object.freeze({ client: client, alunos: copia(alunos), snapshot: function () { return copia(tabelas); }, simulate: simulate });
})();
