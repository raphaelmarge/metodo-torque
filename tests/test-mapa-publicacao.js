/* Configuração pública do Mapbox gerada no artefato de publicação.
 * Somente tokens fictícios e diretórios temporários; não consulta APIs. */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const ROOT = path.resolve(__dirname, '..');
const { render } = require('../tools/mapa-config/gera.js');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const TOKEN = 'pk.fixturePayload.fixtureSignature';
let checks = 0;
function ok(value, label) { assert.ok(value, label); checks++; console.log('OK ' + label); }
function eq(value, expected, label) { assert.deepEqual(value, expected); checks++; console.log('OK ' + label); }
function evaluate(source, previous = {}) {
  const messages = [];
  const sandbox = { self: { MT_MAPA: { ...previous } }, console: Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level => [level, (...args) => messages.push(args.map(String).join(' '))])) };
  vm.runInNewContext(source, sandbox, { timeout: 1000 });
  return { map: JSON.parse(JSON.stringify(sandbox.self.MT_MAPA)), messages };
}
function observeRender(token) {
  const messages = [], methods = ['log', 'info', 'warn', 'error', 'debug'];
  const original = Object.fromEntries(methods.map(level => [level, console[level]]));
  let source, error;
  try {
    for (const level of methods) console[level] = (...args) => messages.push(args.map(String).join(' '));
    source = render(token);
  } catch (e) { error = e; }
  finally { for (const level of methods) console[level] = original[level]; }
  return { source, error, messages };
}

const publicAttempt = observeRender(TOKEN), publicSource = publicAttempt.source;
eq(publicAttempt.messages, [], 'gerador não imprime o token público recebido');
eq(evaluate(publicSource).map.mapboxToken, TOKEN, 'token público válido produz JavaScript executável');
eq(evaluate(publicSource, { cartoKey: 'carto-ficticio', outraOpcao: true }).map, { cartoKey: 'carto-ficticio', outraOpcao: true, mapboxToken: TOKEN }, 'configuração gerada preserva outras opções de mapa');
eq(evaluate(publicSource).messages, [], 'configuração pública não escreve o token no console');
eq(evaluate(render('')).map.mapboxToken, '', 'configuração vazia mantém Mapbox desativado nos testes e no checkout');
eq(render(TOKEN), render(TOKEN), 'geração é determinística para o mesmo valor');
for (const [label, invalid] of [
  ['segredo', 'sk.fixturePayload.fixtureSignature'],
  ['prefixo incorreto', 'secret.fixturePayload.fixtureSignature'],
  ['assinatura ausente', 'pk.fixturePayload'],
  ['segmento vazio', 'pk..fixtureSignature'],
  ['espaço no meio', 'pk.fixture Payload.fixtureSignature'],
  ['quebra de linha no meio', 'pk.fixture\nPayload.fixtureSignature'],
  ['inserção de script', 'pk.fixturePayload.fixtureSignature</script><script>self.injetado=true</script>'],
  ['inserção de aspas', 'pk.fixturePayload.fixtureSignature";self.injetado=true;//']
]) {
  const { error, messages } = observeRender(invalid);
  ok(error instanceof Error, 'recusa ' + label + ' antes de gerar o arquivo');
  ok(!String(error.message).includes(invalid), 'erro de ' + label + ' não devolve a credencial recebida');
  ok(!messages.join('\n').includes(invalid), 'validação de ' + label + ' não revela o valor nos logs');
}

const stubFile = path.join(ROOT, 'assets/mapa-config.js');
const stubBefore = fs.readFileSync(stubFile, 'utf8');
eq(evaluate(stubBefore).map.mapboxToken, '', 'arquivo versionado contém somente a configuração desativada');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'torque-mapa-publicacao-'));
try {
  const destination = path.join(tmp, 'artefato');
  fs.mkdirSync(path.join(destination, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(destination, 'assets', 'preservar.txt'), 'Conteúdo versionado fictício');
  const output = path.join(destination, 'assets', 'mapa-config.js');
  const run = (token, required = false) => spawnSync(process.execPath, [path.join(ROOT, 'tools/mapa-config/gera.js'), destination], {
    cwd: ROOT, encoding: 'utf8', env: { ...process.env, MAPBOX_PUBLIC_TOKEN: token, REQUIRE_MAPBOX_PUBLIC_TOKEN: String(required) }
  });
  let result = run(TOKEN, true);
  eq(result.status, 0, 'CLI prepara configuração pública no diretório do artefato');
  eq(evaluate(fs.readFileSync(output, 'utf8')).map.mapboxToken, TOKEN, 'artefato recebe o valor autorizado para publicação');
  ok(!(result.stdout + result.stderr).includes(TOKEN), 'CLI não imprime o token durante a publicação');
  eq(fs.readFileSync(path.join(destination, 'assets', 'preservar.txt'), 'utf8'), 'Conteúdo versionado fictício', 'geração não modifica outros arquivos do artefato');
  const existing = fs.readFileSync(output, 'utf8');
  result = run('sk.fixturePayload.fixtureSignature', true);
  ok(result.status !== 0, 'CLI bloqueia token secreto');
  ok(!(result.stdout + result.stderr).includes('sk.fixturePayload.fixtureSignature'), 'CLI trata rejeição sem revelar token secreto nos logs');
  eq(fs.readFileSync(output, 'utf8'), existing, 'valor inválido não substitui o arquivo previamente preparado');
  result = run('', true);
  ok(result.status !== 0, 'publicação que exige Mapbox falha quando a variável está vazia');
  eq(fs.readFileSync(output, 'utf8'), existing, 'ausência obrigatória não publica silenciosamente um token vazio');
  result = run('', false);
  eq(result.status, 0, 'CI de pull request permite configuração vazia sem credencial real');
  eq(evaluate(fs.readFileSync(output, 'utf8')).map.mapboxToken, '', 'CI sem token produz configuração explicitamente desativada');
  eq(fs.readFileSync(stubFile, 'utf8'), stubBefore, 'geração externa não grava o token no checkout versionado');
} finally {
  const resolved = path.resolve(tmp);
  const tempRoot = path.resolve(os.tmpdir()) + path.sep;
  assert.ok(resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('torque-mapa-publicacao-'));
  fs.rmSync(resolved, { recursive: true, force: true });
}

function scripts(html) { return [...html.matchAll(/<script\b([^>]*)>/gi)].map(match => ({ tag: match[0], position: match.index, src: (match[1].match(/\bsrc\s*=\s*['"]([^'"]+)['"]/i) || [])[1] })); }
for (const filename of ['app/index.html', 'personal.html']) {
  const html = read(filename), entries = scripts(html);
  const config = entries.filter(entry => /(?:^|\/)assets\/mapa-config\.js$/.test(entry.src || ''));
  const builder = entries.find(entry => /(?:^|\/)aluno-builder\.js$/.test(entry.src || ''));
  const cloud = entries.find(entry => /(?:^|\/)cloud-config\.js$/.test(entry.src || ''));
  ok(config.length === 1 && builder && cloud && cloud.position < config[0].position && config[0].position < builder.position, filename + ': configuração única é carregada depois da base e antes do builder');
  ok(!/\b(?:async|defer)\b/.test(config[0].tag), filename + ': configuração não disputa a execução do builder');
}
for (const filename of ['demo-aluno.html', 'demo-aluno-cadastro.html', 'demo-aluno-sem-cadastro.html']) {
  const html = read(filename), config = scripts(html).filter(entry => /(?:^|\/)assets\/mapa-config\.js$/.test(entry.src || ''));
  const runtime = html.search(/var\s+__demoLS\s*=/);
  ok(config.length === 1 && runtime > config[0].position, filename + ': configuração pública é carregada antes da inicialização da demo');
  ok(!/self\.MT_MAPA\s*=\s*\{\s*["']?mapboxToken/.test(html), filename + ': demonstração não incorpora uma cópia do token');
}
for (const filename of ['sw.js', 'app/app-sw.js']) {
  const beforeInstall = read(filename).split(/addEventListener\(\s*['"]install['"]/)[0];
  ok(/["'](?:\.\.\/)?assets\/mapa-config\.js["']/.test(beforeInstall), filename + ': configuração faz parte do cache de instalação');
}
const packaging = read('.github/scripts/prepare-pages.sh');
const generation = packaging.indexOf('tools/mapa-config/gera.js');
ok(generation > packaging.indexOf('git archive') && generation < packaging.indexOf("printf 'path="), 'publicação gera configuração somente no artefato após extrair o commit aprovado');
const workflow = read('.github/workflows/tests.yml');
ok(/MAPBOX_PUBLIC_TOKEN:\s*\$\{\{\s*vars\.MAPBOX_PUBLIC_TOKEN\s*\}\}/.test(workflow), 'workflow recebe o token público da variável do repositório');
ok(/REQUIRE_MAPBOX_PUBLIC_TOKEN:[^\n]*inputs\.upload_pages/.test(workflow), 'Pages exige configuração enquanto o CI de PR pode ficar sem token');
console.log(checks + ' verificações da configuração de publicação Mapbox passaram.');
