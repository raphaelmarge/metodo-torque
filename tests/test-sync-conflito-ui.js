/* Regressão do aviso persistente: não toca em rede nem dados reais. */
const fs=require('node:fs'),assert=require('node:assert/strict'),path=require('node:path');
const code=fs.readFileSync(path.join(__dirname,'../apps/store.js'),'utf8');
const start=code.indexOf("var carregar = document.createElement('button')");
const end=code.indexOf("function resolveConflito",start);
assert.ok(start>0&&end>start,'bloco visual do conflito existe');
const ui=code.slice(start,end);
assert.match(ui,/fechar\.textContent = 'Fechar aviso'/,'há ação explícita para dispensar o aviso');
assert.match(ui,/fechar\.onclick[\s\S]*box\.remove\(\)/,'fechar remove a caixa da tela');
const handler=(ui.match(/fechar\.onclick = function \(\) \{([\s\S]*?)\n    \};/)||[])[1]||'';
assert.doesNotMatch(handler,/delete\s+sync\.conflitos|resolveConflito/,'fechar não resolve nem apaga o conflito protegido');
assert.match(ui,/carregar\.disabled = true/,'carregar nuvem evita clique duplicado durante resolução');
assert.match(ui,/Não foi possível resolver agora/,'falha de resolução recebe retorno visível');
assert.match(code,/var chaves = Object\.keys\(sync\.sujas\)\.filter\(function \(k\) \{ return !\(sync\.conflitos && sync\.conflitos\[k\]\); \}\);/,'conflito fechado continua bloqueando envio');
console.log('OK — aviso pode ser fechado sem remover a proteção do conflito.');
