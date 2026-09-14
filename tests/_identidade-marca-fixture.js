/* Dependências reais do payload de questionários nas fixtures isoladas.
 * Não substitui a resolução da marca por um mock: inclui o núcleo público e
 * o helper do Personal, exatamente como carregados na página completa. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'personal.html'), 'utf8');
const start = html.indexOf('  function marcaPublica(');
const end = html.indexOf('  function nomeStudio(', start);
assert.ok(start >= 0 && end > start, 'O helper canônico da marca precisa existir');
module.exports = fs.readFileSync(path.join(root, 'assets/identidade-marca.js'), 'utf8') + '\n' + html.slice(start, end);
