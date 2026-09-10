const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cadastro = fs.readFileSync(path.join(ROOT, 'demo-aluno-cadastro.html'), 'utf8');
const semCadastro = fs.readFileSync(path.join(ROOT, 'demo-aluno-sem-cadastro.html'), 'utf8');
const canon = fs.readFileSync(path.join(ROOT, 'demo-aluno.html'), 'utf8');
const arquivos = ['demo-aluno.html', 'demo-aluno-cadastro.html', 'demo-aluno-sem-cadastro.html'];
const modificadosEm = arquivos.map(arquivo => fs.statSync(path.join(ROOT, arquivo), {bigint: true}).mtimeNs);
const { gerarVariantes } = require('../tools/demo-aluno/regen-demos.js');
const marker = 'var __demoOnboardingAceite=null;';
const aceite = "var __demoOnboardingAceite={id:'demo-aceite-concluido',aceito_em:'2026-09-10T12:00:00Z',documento_hash:'demo-concluido'};";
const titulo = html => (html.match(/<title>([^<]*)<\/title>/) || [])[1];
const normalizaTitulo = html => html.replace(/<title>[^<]*<\/title>/, '<title>X</title>');
let verificacoes = 0;
function verifica(nome, fn) {
  fn();
  verificacoes++;
  console.log('OK — ' + nome);
}
// Comparar o conteúdo inteiro, mas não despejar megabytes de HTML no log de erro.
function identicos(atual, esperado, mensagem) {
  assert.ok(atual === esperado, mensagem);
}

verifica('título da demo com cadastro', () => {
  assert.equal(titulo(cadastro), 'Alex · Demo do aluno — com cadastro inicial');
});
verifica('título publicado de acesso direto', () => {
  assert.equal(titulo(semCadastro), 'Alex · Demo do aluno — acesso direto');
});
verifica('cadastro começa com exatamente um aceite pendente', () => {
  assert.equal(cadastro.split(marker).length - 1, 1);
  assert.equal(cadastro.split('var __demoOnboardingAceite=').length - 1, 1);
});
verifica('acesso direto começa com exatamente um aceite concluído', () => {
  assert.equal(semCadastro.split(aceite).length - 1, 1);
  assert.equal(semCadastro.split('var __demoOnboardingAceite=').length - 1, 1);
  assert.ok(!semCadastro.includes(marker), 'demo de acesso direto não pode voltar ao onboarding');
});
verifica('cadastro preserva todo o conteúdo canônico fora do título', () => {
  identicos(normalizaTitulo(cadastro), normalizaTitulo(canon), 'demo com cadastro divergiu da canônica');
});
verifica('acesso direto difere somente pelo título e aceite inicial', () => {
  identicos(normalizaTitulo(semCadastro).replace(aceite, marker), normalizaTitulo(canon), 'demo de acesso direto alterou conteúdo além do título e aceite');
});
const geradas = gerarVariantes(canon);
verifica('gerador reproduz exatamente a demo com cadastro publicada', () => {
  identicos(geradas.comCadastro, cadastro, 'regen-demos.js geraria uma demo com cadastro diferente do arquivo versionado');
});
verifica('gerador reproduz exatamente a demo de acesso direto publicada', () => {
  identicos(geradas.semCadastro, semCadastro, 'regen-demos.js geraria uma demo de acesso direto diferente do arquivo versionado');
});
verifica('derivação repetida é determinística', () => {
  const repetidas = gerarVariantes(canon);
  identicos(repetidas.comCadastro, geradas.comCadastro, 'cadastro mudou na segunda derivação');
  identicos(repetidas.semCadastro, geradas.semCadastro, 'acesso direto mudou na segunda derivação');
});
verifica('importar e derivar não regrava a fonte nem as demos', () => {
  assert.deepEqual(arquivos.map(arquivo => fs.statSync(path.join(ROOT, arquivo), {bigint: true}).mtimeNs), modificadosEm);
  for (const [arquivo, esperado] of [['demo-aluno.html', canon], ['demo-aluno-cadastro.html', cadastro], ['demo-aluno-sem-cadastro.html', semCadastro]]) {
    identicos(fs.readFileSync(path.join(ROOT, arquivo), 'utf8'), esperado, arquivo + ' foi regravado durante a verificação');
  }
});
const minimo = '<!doctype html><title>Canônica</title><script>' + marker + '</script><main>Conteúdo preservado</main>';
verifica('derivação funciona sem depender dos dados atuais do Alex', () => {
  const resultado = gerarVariantes(minimo);
  identicos(resultado.comCadastro, minimo.replace('Canônica', 'Alex · Demo do aluno — com cadastro inicial'), 'cadastro mínimo foi alterado indevidamente');
  identicos(resultado.semCadastro, minimo.replace('Canônica', 'Alex · Demo do aluno — acesso direto').replace(marker, aceite), 'acesso direto mínimo foi alterado indevidamente');
});
for (const [nome, entrada, erro] of [
  ['fonte sem estado inicial', minimo.replace(marker, ''), /exatamente um estado inicial/],
  ['fonte com estado inicial duplicado', minimo + marker, /exatamente um estado inicial/],
  ['fonte sem título', minimo.replace('<title>Canônica</title>', ''), /exatamente um título/],
  ['fonte com título duplicado', minimo + '<title>Duplicado</title>', /exatamente um título/],
  ['fonte que não é HTML textual', null, /deve ser texto HTML/]
]) {
  verifica('recusa ' + nome, () => assert.throws(() => gerarVariantes(entrada), erro));
}
console.log(verificacoes + ' verificações passaram — duas demos isoladas e sincronizadas com a canônica e seu gerador.');
