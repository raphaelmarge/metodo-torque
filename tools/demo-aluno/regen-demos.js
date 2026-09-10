/* Gera as duas demos públicas do app do aluno a partir da demo canônica.
 *
 * Requer o mesmo servidor local usado por regen-demo.js na porta 8765.
 * Saídas:
 *   demo-aluno-cadastro.html     — mostra toda a entrada inicial/contrato.
 *   demo-aluno-sem-cadastro.html — simula o cadastro concluído (acesso direto).
 *
 * A CLI regenera demo-aluno.html pelo fluxo canônico antes de derivar as
 * variantes. Importar gerarVariantes permite conferir as saídas sem escrever
 * arquivos nem abrir navegador.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const marker = 'var __demoOnboardingAceite=null;';
const aceite = "var __demoOnboardingAceite={id:'demo-aceite-concluido',aceito_em:'2026-09-10T12:00:00Z',documento_hash:'demo-concluido'};";

function gerarVariantes(src) {
  if (typeof src !== 'string') throw new TypeError('A demo canônica deve ser texto HTML.');
  if (src.split(marker).length !== 2) {
    throw new Error('A demo canônica precisa conter exatamente um estado inicial de onboarding.');
  }
  const titulos = src.match(/<title>[^<]*<\/title>/g) || [];
  if (titulos.length !== 1) {
    throw new Error('A demo canônica precisa conter exatamente um título.');
  }
  const titulo = /<title>[^<]*<\/title>/;
  return {
    comCadastro: src.replace(titulo, '<title>Alex · Demo do aluno — com cadastro inicial</title>'),
    semCadastro: src
      .replace(titulo, '<title>Alex · Demo do aluno — acesso direto</title>')
      .replace(marker, aceite)
  };
}

if (require.main === module) {
  const regen = path.join(__dirname, 'regen-demo.js');
  const r = spawnSync(process.execPath, [regen], { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.error) console.error(r.error.message);
  if (r.status !== 0) process.exit(r.status || 1);
  const src = fs.readFileSync(path.join(ROOT, 'demo-aluno.html'), 'utf8');
  const { comCadastro, semCadastro } = gerarVariantes(src);
  fs.writeFileSync(path.join(ROOT, 'demo-aluno-cadastro.html'), comCadastro);
  fs.writeFileSync(path.join(ROOT, 'demo-aluno-sem-cadastro.html'), semCadastro);
  console.log('demos do aluno geradas:', comCadastro.length, semCadastro.length);
}

module.exports = { gerarVariantes };
