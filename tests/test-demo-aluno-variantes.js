const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const cadastro = fs.readFileSync(path.join(ROOT, 'demo-aluno-cadastro.html'), 'utf8');
const direto = fs.readFileSync(path.join(ROOT, 'demo-aluno-direto.html'), 'utf8');
const canon = fs.readFileSync(path.join(ROOT, 'demo-aluno.html'), 'utf8');

assert.match(cadastro, /<title>Alex · Demo do aluno — com cadastro inicial<\/title>/);
assert.match(direto, /<title>Alex · Demo do aluno — acesso direto<\/title>/);
assert.equal((cadastro.match(/var __demoOnboardingAceite=null;/g)||[]).length, 1, 'demo com cadastro precisa começar sem aceite');
assert.equal((direto.match(/var __demoOnboardingAceite=\{id:'demo-aceite-concluido'/g)||[]).length, 1, 'demo direta precisa começar com aceite concluído');
assert.ok(!direto.includes('var __demoOnboardingAceite=null;'), 'demo direta não pode voltar ao onboarding');
assert.equal(cadastro.replace(/<title>[^<]*<\/title>/,'<title>X</title>'), canon.replace(/<title>[^<]*<\/title>/,'<title>X</title>'), 'demo com cadastro deve ser idêntica à canônica fora do título');
const normalizaDireto = direto.replace(/<title>[^<]*<\/title>/,'<title>X</title>').replace("var __demoOnboardingAceite={id:'demo-aceite-concluido',aceito_em:'2026-09-10T12:00:00Z',documento_hash:'demo-concluido'};", 'var __demoOnboardingAceite=null;');
assert.equal(normalizaDireto, canon.replace(/<title>[^<]*<\/title>/,'<title>X</title>'), 'demo direta só pode diferir pelo título e estado inicial de aceite');
console.log('OK — duas demos do aluno isoladas e sincronizadas com a canônica.');
