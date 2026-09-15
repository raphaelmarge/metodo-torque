/* Contrato editorial da ajuda da mesma release: conteúdo real, links e limites. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'personal.html'), 'utf8');
const start = html.indexOf('  function ajBt('), end = html.indexOf('  var ajAberto = null;', start);
assert.ok(start >= 0 && end > start, 'O catálogo canônico da ajuda deve existir.');
const box = {};
vm.runInNewContext(html.slice(start, end), box, { timeout: 2000 });
const topics = JSON.parse(JSON.stringify(box.AJUDA_PT));
const byId = new Map(topics.map(t => [t.id, t]));
let checks = 0;
function ok(value, message) { assert.ok(value, message); checks++; console.log('OK ' + message); }
const topicText = id => JSON.stringify(byId.get(id) || {});
const plainText = topics.map(t => t.subs.map(s => s.p.join(' ')).join(' ')).join(' ');
const oldIds = 'comeco inicio alunos agenda treinos financeiro chat avaliacoes quest comunidade relatorios assessoria appaluno zap sitepro conta'.split(' ');
ok(topics.length === 24 && byId.size === 24, '24 tópicos únicos, sem retirar as 16 áreas anteriores');
for (const id of oldIds) ok(byId.has(id), 'Preserva tópico ' + id);
ok(topics[0].id === 'novidades', 'Novidades é o primeiro tópico, não um novo destino do menu');
for (const t of topics) {
  ok(t.t && t.d && t.ic && Array.isArray(t.subs) && t.subs.length > 0, 'Tópico completo: ' + t.id);
  ok(t.subs.every(s => s.t && Array.isArray(s.p) && s.p.length && s.p.every(p => typeof p === 'string' && p.trim())), 'Passos não vazios: ' + t.id);
}
ok(topics.reduce((n,t) => n+t.subs.length, 0) === 105, '105 perguntas e orientações revisadas');
for (const m of plainText.matchAll(/data-ajtopico='([^']+)'/g)) ok(byId.has(m[1]), 'Atalho de ajuda aponta para tópico existente: ' + m[1]);
ok(topicText('marca').includes('desligado por padrão') && topicText('marca').includes('sem segunda linha nem espaço vazio'), 'Identidade secundária é opcional sem espaço vazio');
ok(topicText('marca').includes('Salvar identidade') && topicText('marca').includes('Publicar') && topicText('marca').includes('Pix'), 'Separa prévia, salvar, publicar e dados bancários');
ok(topicText('cancelamentos').includes('não envia Pix') && topicText('cancelamentos').includes('não estorna cartão automaticamente'), 'Devolução nunca é anunciada como transferência automática');
ok(topicText('cancelamentos').includes('não revoga automaticamente') && topicText('cancelamentos').includes('aguarde a confirmação do provedor'), 'Cancelamento não promete revogação ou fim de cobrança sem provedor');
ok(topicText('cancelamentos').includes('não o anexo') && topicText('cancelamentos').includes('não é comprovante bancário'), 'Referência não vira upload ou comprovante de banco');
ok(topicText('financeiro').includes('data informada para a devolução') && topicText('financeiro').includes('não é uma saída'), 'Data da devolução e pendência no caixa explicadas');
ok(topicText('sincronizacao').includes('não combina automaticamente') && topicText('sincronizacao').includes('Não limpe os dados'), 'Recuperação não promete merge cego nem sugere apagar dados');
ok(topicText('presencial').includes('não é confirmação de recebimento na nuvem') && topicText('presencial').includes('não equivale a finalizar'), 'Limites da sessão offline e campos não finalizados explícitos');
ok(topicText('alunos').includes('sessões marcadas como feitas na agenda') && topicText('alunos').includes('8 semanas'), 'Frequência identifica a fonte real');
ok(topicText('automacoes').includes('não envia mensagem nem altera o treino'), 'Providência não é envio de WhatsApp ou prescrição');
ok(topicText('quest').includes('não reescreve') && topicText('quest').includes('Texto livre não é uma nota'), 'Modelos preservam histórico e tipo de resposta');
ok(topicText('treinos').includes('1 a 12 semanas') && topicText('treinos').includes('metros, quilômetros, minutos ou segundos'), 'Calendário por data, cópia e corrida por etapas');
ok(topicText('nutricao').includes('rascunho') && topicText('nutricao').includes('proposta precisa de revisão') && topicText('nutricao').includes('publique'), 'Plano alimentar exige revisão e publicação');
ok(topicText('medalhas').includes('não certificam') && topicText('medalhas').includes('registros disponíveis'), 'Conquistas não viram certificados ou totais vitalícios');
for (const unsafe of ['Tudo funciona offline neste aparelho', 'o acesso morre na hora', 'que devolve aula e pagamento', 'monta o mês inteiro (4 semanas']) ok(!plainText.includes(unsafe), 'Corrige afirmação antiga: ' + unsafe);
const code = file => fs.readFileSync(path.join(ROOT,file),'utf8');
for (const [file, labels] of [
  ['assets/personal-fluxo.js', ['Próxima melhor ação','Aluno 360°','Iniciar sessão','Automações e providências','Finalizar e salvar']],
  ['assets/personal-estornos.js', ['Cancelar atendimento','Já devolvi o dinheiro','Devolução']],
  ['personal.html', ['Mostrar nome do personal abaixo da marca','Nome em destaque','Salvar identidade']],
]) for (const label of labels) ok(code(file).includes(label), 'Orientação corresponde a controle real: ' + label);
// O caminho deve estar na resposta da Loja, não em um comentário para satisfazer o CI.
const loja = byId.get('appaluno').subs.find(s => s.t === 'Loja no app');
ok(loja.p.some(p => p.includes('Personalização → Benefícios e loja → Loja do app')), 'Loja explica o caminho completo da navegação atual');
const uiSource = code('tests/test-ajuda-atualizada-ui.js');
ok(/require\(["']\.\/_nuvem\.js["']\)/.test(uiSource), 'Ajuda usa a importação canônica do cliente compartilhado');
ok(byId.get('agenda').subs.some(s => (s.fig||'').includes('assets/ajuda/') && s.fig.includes('ajfoco')), 'Preserva figuras e imagens da agenda');
ok(html.includes('[tp.t, tp.d, tp.k || ""]') && html.includes('busca.split(/\\s+/).some'), 'Busca indexa aliases e todos os termos');
console.log(checks + ' verificações editoriais da ajuda passaram.');
