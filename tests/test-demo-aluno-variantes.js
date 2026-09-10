const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cadastro = fs.readFileSync(path.join(ROOT, 'demo-aluno-cadastro.html'), 'utf8');
const semCadastro = fs.readFileSync(path.join(ROOT, 'demo-aluno-sem-cadastro.html'), 'utf8');
const canon = fs.readFileSync(path.join(ROOT, 'demo-aluno.html'), 'utf8');

assert.match(cadastro, /<title>Alex · Demo do aluno — com cadastro inicial<\/title>/);
assert.match(semCadastro, /<title>Alex · Demo do aluno — sem cadastro inicial<\/title>/);
assert.equal((cadastro.match(/var __demoOnboardingAceite=null;/g)||[]).length, 1, 'demo com cadastro precisa começar sem aceite');
assert.equal((semCadastro.match(/var __demoOnboardingAceite=\{id:'demo-aceite-concluido'/g)||[]).length, 1, 'demo sem cadastro precisa começar com aceite concluído');
assert.ok(!semCadastro.includes('var __demoOnboardingAceite=null;'), 'demo sem cadastro não pode voltar ao onboarding');
assert.equal(cadastro.replace(/<title>[^<]*<\/title>/,'<title>X</title>'), canon.replace(/<title>[^<]*<\/title>/,'<title>X</title>'), 'demo com cadastro deve ser idêntica à canônica fora do título');
const normalizaSemCadastro = semCadastro.replace(/<title>[^<]*<\/title>/,'<title>X</title>').replace("var __demoOnboardingAceite={id:'demo-aceite-concluido',aceito_em:'2026-09-10T12:00:00Z',documento_hash:'demo-concluido'};", 'var __demoOnboardingAceite=null;');
assert.equal(normalizaSemCadastro, canon.replace(/<title>[^<]*<\/title>/,'<title>X</title>'), 'demo sem cadastro só pode diferir pelo título e estado inicial de aceite');
console.log('OK — duas demos do aluno isoladas e sincronizadas com a canônica.');
