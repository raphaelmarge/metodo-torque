/* Gera as duas demos públicas do app do aluno a partir da demo canônica.
 *
 * Requer o mesmo servidor local usado por regen-demo.js na porta 8765.
 * Saídas:
 *   demo-aluno-cadastro.html     — mostra toda a entrada inicial/contrato.
 *   demo-aluno-sem-cadastro.html — simula o cadastro inicial já concluído e abre o app.
 *
 * O objetivo é não manter duas cópias de lógica: primeiro regeneramos
 * demo-aluno.html pelo fluxo canônico e só então derivamos as duas variantes.
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const regen = path.join(__dirname, 'regen-demo.js');

const r = spawnSync(process.execPath, [regen], { cwd: ROOT, stdio: 'inherit', env: process.env });
if (r.status !== 0) process.exit(r.status || 1);

const srcPath = path.join(ROOT, 'demo-aluno.html');
const src = fs.readFileSync(srcPath, 'utf8');
const marker = 'var __demoOnboardingAceite=null;';
if ((src.match(new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
  throw new Error('Estado do onboarding da demo mudou; revisar regen-demos.js antes de gerar as variantes.');
}

const titulo = /<title>[^<]*<\/title>/;
if (!titulo.test(src)) throw new Error('Título da demo canônica não encontrado.');

const comCadastro = src.replace(titulo, '<title>Alex · Demo do aluno — com cadastro inicial</title>');
const aceite = "var __demoOnboardingAceite={id:'demo-aceite-concluido',aceito_em:'2026-09-10T12:00:00Z',documento_hash:'demo-concluido'};";
const semCadastro = src
  .replace(titulo, '<title>Alex · Demo do aluno — sem cadastro inicial</title>')
  .replace(marker, aceite);

fs.writeFileSync(path.join(ROOT, 'demo-aluno-cadastro.html'), comCadastro);
fs.writeFileSync(path.join(ROOT, 'demo-aluno-sem-cadastro.html'), semCadastro);
console.log('demos do aluno geradas:', comCadastro.length, semCadastro.length);
