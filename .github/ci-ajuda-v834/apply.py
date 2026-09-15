from pathlib import Path
import hashlib
import sys

root = Path('.')
before = {
    'tests/test-ajuda-atualizada-ui.js': '88c2a9d2d78db6dfc515f0f5a01ee7d560ca2ca01b54781817abd0f4020c87e6',
    'personal.html': 'e8f33564b6f8588587a15a0d2d191bda2949465b0797a022a2a56bd8bd772a2e',
    'tests/test-personal.js': '1badf286042a34c73995904e017d8554c3cd835020cacaf9f9f5fcc87412d5eb',
    'tests/test-ajuda-atualizada-core.js': '5981466dd9ac424487e25c515d17dac34786e922211cd7c4f538e0ef10d1f75f',
}
after = {
    'tests/test-ajuda-atualizada-ui.js': '39b63fc9caf168c5d2474e62d56280963ccc92f5b16f1dd7cb6abe2a3e0a9630',
    'personal.html': 'fae812c6ea5685a6fac46b2ff30f074d41d4717c51e08454c68016459ed4bb98',
    'tests/test-personal.js': '767f8e777faa67cb9d0a1e2452fff9dd82250cbf65e6ae6f0b963ed546a6d56b',
    'tests/test-ajuda-atualizada-core.js': 'ce78bf704ffe2099378d9b4518bc29c8979e16d274cdf92b2e37075402d54f2d',
}
def check(expected):
    for name, digest in expected.items():
        actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
        assert actual == digest, (name, actual, digest)
        print(actual, name)
if '--check' in sys.argv:
    check(after)
    sys.exit(0)
check(before)
def replace(name, old, new):
    p = root / name
    s = p.read_text()
    assert s.count(old) == 1, (name, old[:80], s.count(old))
    p.write_text(s.replace(old, new))
replace('tests/test-ajuda-atualizada-ui.js', "require('./_nuvem');", "require('./_nuvem.js');")
replace('personal.html',
    'Cadastre os produtos ou serviços no controle de loja da Personalização e confira como a compra será atendida.',
    'Abra <b>Personalização → Benefícios e loja → Loja do app</b> para cadastrar os produtos ou serviços e conferir como a compra será atendida.')
replace('tests/test-personal.js', '/Personalização → Loja/.test(srcP)', '/Personalização → Benefícios e loja → Loja do app/.test(srcP)')
replace('tests/test-ajuda-atualizada-core.js', "ok(byId.get('agenda').subs.some", "// O caminho deve estar na resposta da Loja, não em um comentário para satisfazer o CI.\nconst loja = byId.get('appaluno').subs.find(s => s.t === 'Loja no app');\nok(loja.p.some(p => p.includes('Personalização → Benefícios e loja → Loja do app')), 'Loja explica o caminho completo da navegação atual');\nconst uiSource = code('tests/test-ajuda-atualizada-ui.js');\nok(/require\\([\"']\\.\\/_nuvem\\.js[\"']\\)/.test(uiSource), 'Ajuda usa a importação canônica do cliente compartilhado');\nok(byId.get('agenda').subs.some")
anchor = "  eq(await p.evaluate(()=>localStorage.getItem('mtapp:ptStudio')),initial,'Ler, buscar e navegar na ajuda preservam todo o estado do negócio');"
extra = """  // Confere a orientação no conteúdo visível e percorre a interface real.
  // Só navega: não cadastra produto, não altera a marca e não publica pacotes.
  await p.evaluate(()=>__ajudaPT.abre('appaluno'));
  const lojaAjuda = p.locator('#vAjuda details').filter({has:p.locator('summary', {hasText:'Loja no app'})});
  await lojaAjuda.locator('summary').click();
  ok((await lojaAjuda.innerText()).includes('Personalização → Benefícios e loja → Loja do app'),'Caminho completo da Loja está visível na ajuda');
  await p.evaluate(()=>document.querySelector('#abas [data-a="pers"]').click());
  await p.locator('#persArea').selectOption({label:'Benefícios e loja'});
  await p.locator('#vPers summary').filter({hasText:/^Loja do app$/}).click();
  ok(await p.locator('#lojaNome').isVisible(),'Orientação leva ao campo de produto da Loja real');
  ok(await p.locator('#lojaAdd').isVisible(),'Ação de cadastrar continua acessível sem executá-la');
  await p.evaluate(()=>{document.querySelector('#abas [data-a="ajuda"]').click();__ajudaPT.abre(null);});
"""
replace('tests/test-ajuda-atualizada-ui.js', anchor, extra + anchor)
check(after)
