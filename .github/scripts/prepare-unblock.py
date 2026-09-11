from pathlib import Path
import subprocess
BASE='102fcdbc4f5c83dc3ec0aa18cb32d4d6dd0dc176'
EXPECTED='90a59433a6f9481312e46b0cae5af4b501f9e77c'
FILES=['app/app-sw.js','assets/personal-nutricao.js','assets/versao.js','docs/personal/DESBLOQUEIO-MT-V824.md','sw.js','tests/_sync-primeira-puxada.js','tests/test-nutricao-personal-completa.js','tests/test-nutricao-registros-estaveis.js','tests/test-personal.js','tests/test-sync-identidade.js','tests/test-sync-primeira-puxada.js']
def git(*a):return subprocess.check_output(['git',*a],text=True).strip()
for name in FILES:
 if name.startswith('docs/') or name in ['tests/_sync-primeira-puxada.js','tests/test-sync-primeira-puxada.js','tests/test-nutricao-registros-estaveis.js']:continue
 assert git('hash-object',name)==git('rev-parse',BASE+':'+name),'Base alterada: '+name
p=Path('assets/personal-nutricao.js'); s=p.read_text()
a="return '<details class=\"pn-details\"><summary>' + esc((r.hora ?"
b="return '<details class=\"pn-details\" data-pnrecord=\"'+esc(JSON.stringify([owner,r.id]))+'\"><summary>' + esc((r.hora ?"
assert s.count(a)==1;s=s.replace(a,b)
helper='''  // Reconsultar não é fechar a refeição que o profissional está lendo.
  // A identidade inclui conta, aluno e token. Nenhum estado visual passa de conta.
  function atualizaRegistrosDOM(el, html, scope) {
    var anterior = el._pnRecordsView, mesma = anterior && anterior.scope === scope;
    if (mesma && anterior.html === html) return; // conserva nós, foco e expansão
    var abertos = Object.create(null), foco = document.activeElement, focoKey = null, focoTipo = null;
    if (mesma) {
      el.querySelectorAll('details[data-pnrecord]').forEach(function (d) {
        var key = d.getAttribute('data-pnrecord');
        if (d.open) abertos[key] = true;
        if (foco && d.contains(foco)) {
          focoKey = key;
          focoTipo = foco.hasAttribute('data-pnfeedback') ? 'button[data-pnfeedback]' : foco.tagName === 'SUMMARY' ? 'summary' : null;
        }
      });
    }
    el.innerHTML = html;
    el._pnRecordsView = { scope: scope, html: html };
    el.querySelectorAll('details[data-pnrecord]').forEach(function (d) {
      var key = d.getAttribute('data-pnrecord');
      if (abertos[key]) d.open = true;
      if (focoTipo && key === focoKey) {
        var target = d.querySelector(focoTipo);
        if (target) target.focus({ preventScroll: true });
      }
    });
    if (!el._pnRecordsEvents) {
      // O rodapé é fixo: abrir uma refeição perto do fim da tela podia deixar
      // a ação por baixo da navegação. Desloca só o trecho que está encoberto.
      function revelaAcao(d) {
        requestAnimationFrame(function () {
          if (!d || !d.isConnected || !d.open) return;
          var button = d.querySelector('[data-pnfeedback]'), nav = $('navPt');
          if (!button || !nav) return;
          var r = button.getBoundingClientRect(), n = nav.getBoundingClientRect();
          if (r.height > 0 && n.height > 0 && r.top < n.bottom && r.bottom > n.top && r.left < n.right && r.right > n.left) {
            window.scrollBy({ top: r.bottom - n.top + 16, behavior: 'auto' });
          }
        });
      }
      el.addEventListener('toggle', function (e) { if (e.target.matches('details[data-pnrecord]') && e.target.open) revelaAcao(e.target); }, true);
      el.addEventListener('focusin', function (e) { if (e.target.matches('[data-pnfeedback]')) revelaAcao(e.target.closest('details[data-pnrecord]')); });
      el._pnRecordsEvents = true;
    }
  }
  function exibeRegistros(html) {
    atualizaRegistrosDOM($('pnRegistros'), html, JSON.stringify([alunoId, identidadeNutri(C.load(), alunoId)]));
  }
'''
marker='  function buscaRegistros(id, novamente) {'
assert s.count(marker)==1;s=s.replace(marker,helper+marker)
old=s[s.index('  function pintaRegistros()'):s.index('  function contexto(',s.index('  function pintaRegistros()'))]
new=old.replace("$('pnRegistros').innerHTML='<p class=\"muted\">Escolha um aluno para consultar os registros.</p>';", "exibeRegistros('<p class=\"muted\">Escolha um aluno para consultar os registros.</p>');")
new=new.replace("$('pnRegistros').innerHTML='<p class=\"muted\">Carregando os registros do aluno…</p>';", "exibeRegistros('<p class=\"muted\">Carregando os registros do aluno…</p>');")
new=new.replace("$('pnRegistros').innerHTML='<p class=\"muted\">'+esc(busca.erro)+'</p><button type=\"button\" class=\"btn sec\" id=\"pnRegTentar\">Tentar novamente</button>';", "exibeRegistros('<p class=\"muted\">'+esc(busca.erro)+'</p><button type=\"button\" class=\"btn sec\" id=\"pnRegTentar\">Tentar novamente</button>');")
new=new.replace("$('pnRegistros').innerHTML=registrosHtml(list)+(busca&&busca.carregando?'<p class=\"muted\">Atualizando registros…</p>':'');", "exibeRegistros(registrosHtml(list)+(busca&&busca.carregando?'<p class=\"muted\">Atualizando registros…</p>':''));")
assert "$('pnRegistros').innerHTML" not in new
start=new.index('  function perfil(id)');new=new[:start]+'''  function perfil(id) {
    if (!C || !$('pfNutricao')) return;
    var st = C.load(), p = plano(st, id), el = $('pfNutricao');
    var scope = JSON.stringify([id, identidadeNutri(st, id)]);
    var mesma = el._pnRecordsView && el._pnRecordsView.scope === scope;
    var aberto = mesma && $('pfNutriRegistros') && $('pfNutriRegistros').open;
    atualizaRegistrosDOM(el, htmlPlano(p) + '<details class="pn-details" id="pfNutriRegistros" '+(aberto?'open':'')+'><summary>Últimos registros de alimentação</summary>' + registrosHtml(registros(st, id).slice(0, 7), id) + '</details>', scope);
    $('pfNutriRegistros').ontoggle = function () { if (this.open) buscaRegistros(id); };
  }
'''
s=s.replace(old,new);p.write_text(s)
p=Path('tests/test-personal.js');s=p.read_text();start=s.index('    const ferro = await p.evaluate(async () => {');end=s.index('    ok(ferro.segurou,',start)
s=s[:start]+'''    // O motor é exercitado numa janela própria, com consulta e confirmação
    // controladas. A janela extensa do painel contém timers de outros módulos:
    // contar todas as RPCs depois de 50 ms confundia essas operações com o CAS.
    const ferro = await require('./_sync-primeira-puxada')(b);
    ok(ferro.identidade && ferro.aguarda && ferro.naoDuplicou && ferro.confirmou && ferro.comuns,
      "primeira puxada valida a identidade, aguarda confirmação e separa o CAS das demais chaves");
'''+s[end:];p.write_text(s)
p=Path('tests/test-nutricao-personal-completa.js');s=p.read_text();old='await reveal(p,\'[data-pnfeedback="reg1"]\');';assert s.count(old)==1
s=s.replace(old,old+'''await p.evaluate(()=>window.MT_PERSONAL_NUTRICAO.render());ok(await p.locator('[data-pnfeedback="reg1"]').locator('xpath=ancestor::details').evaluate(e=>e.open),'Repintura entre abrir e clicar mantém a refeição expandida');''');p.write_text(s)
p=Path('tests/test-sync-identidade.js');s=p.read_text();old='assert.ok(!x.calls.some(c => c.rows)); pull.resolve({data:[]});';assert s.count(old)==1;s=s.replace(old,"assert.ok(!x.calls.some(c => c.rows || c.rpc === 'dados_cas' || c.rpc === 'dados_grava')); pull.resolve({data:[]});");p.write_text(s)
for name in ['assets/versao.js','sw.js','app/app-sw.js']:
 p=Path(name);s=p.read_text();assert s.count('mt-v823')==1;p.write_text(s.replace('mt-v823','mt-v824'))
# Index começa na main exata; os arquivos temporários nunca entram no commit.
git('read-tree',BASE);git('add',*FILES)
tree=git('write-tree');assert tree==EXPECTED,'Árvore diferente da validada localmente: '+tree
print('Árvore verificada: '+tree)
