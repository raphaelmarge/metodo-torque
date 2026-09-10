from pathlib import Path

p = Path('apps/store.js')
s = p.read_text()
old = """    var carregar = document.createElement('button'); carregar.textContent = local ? 'Reabrir com os dados atuais' : 'Carregar versão da nuvem';
    carregar.style.cssText = baixar.style.cssText;
    carregar.onclick = function () { resolveConflito(k).then(function (ok) { if (ok) box.remove(); }); };
    box.appendChild(carregar);
  }
"""
new = """    var carregar = document.createElement('button'); carregar.textContent = local ? 'Reabrir com os dados atuais' : 'Carregar versão da nuvem';
    carregar.style.cssText = baixar.style.cssText;
    carregar.onclick = function () {
      carregar.disabled = true;
      var rotulo = carregar.textContent;
      carregar.textContent = local ? 'Reabrindo…' : 'Carregando…';
      resolveConflito(k).then(function (ok) {
        if (ok) { box.remove(); return; }
        carregar.disabled = false; carregar.textContent = rotulo;
        var status = box.querySelector && box.querySelector('[data-mt-sync-status]');
        if (!status) {
          status = document.createElement('div'); status.setAttribute('data-mt-sync-status', '1');
          status.style.cssText = 'margin-top:10px;color:#ffd9a0;font-size:13px'; box.appendChild(status);
        }
        status.textContent = 'Não foi possível resolver agora. Você pode fechar este aviso sem perder o rascunho; a proteção continuará ativa.';
      }, function () {
        carregar.disabled = false; carregar.textContent = rotulo;
      });
    };
    box.appendChild(carregar);
    var fechar = document.createElement('button'); fechar.type = 'button'; fechar.textContent = 'Fechar aviso';
    fechar.setAttribute('aria-label', 'Fechar aviso de conflito sem descartar o rascunho');
    fechar.style.cssText = baixar.style.cssText + ';background:transparent;color:#fff;border:1px solid #ffffff55';
    fechar.onclick = function () {
      // Fecha só a interface. O item continua em sync.conflitos e segue bloqueando
      // qualquer sobrescrita até a pessoa resolver explicitamente ou recarregar.
      if (box && box.remove) box.remove();
    };
    box.appendChild(fechar);
  }
"""
if s.count(old) != 1:
    raise SystemExit('bloco do conflito mudou; revisar antes de aplicar')
p.write_text(s.replace(old, new))

t = Path('tests/test-sync-conflito-ui.js')
t.write_text(r'''/* Regressão do aviso persistente: não toca em rede nem dados reais. */
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
''')

for name in ('assets/versao.js','sw.js','app/app-sw.js'):
    q = Path(name)
    x = q.read_text()
    if x.count('mt-v818') != 1:
        raise SystemExit(name + ' saiu da versão esperada')
    q.write_text(x.replace('mt-v818','mt-v819'))
