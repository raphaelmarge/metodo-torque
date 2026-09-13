from pathlib import Path
import hashlib

root = Path('.')
helpers = Path('.github/torque-mobile-v832')
expected = {
    'apps/store.js': '96f10a88705bae87b373a793de70039f4070c26ac7d186d634392449bf50fadf',
    'assets/personal-torque-one.js': 'fdfabef5a358efe5a6399ff901544bbc9fc06372808f01f1b64dbc514f0d7f24',
    'assets/versao.js': 'c9a9e00923d5d3949a726770c4c07a3ffdb554731b30dec244070d115157788e',
    'sw.js': '43e1f7f116de5434ef1b1c746d85274a67ae3edb88d4c347c72aee395652eed5',
    'app/app-sw.js': '09b0a1f0fc053adbc8ab3f290ec4c3f679c91cba8d192105a50163e7dbd19864',
    'tests/test-personal-pro-suite.js': '55fdf9d93529941dc7cb8803cfc5d77c0fccddb2f937d558642057044ecabe97',
    'tests/test-torque-one-layout.js': 'fada3abd601975d00c38d20ad956a957da429518b3fab083737f7409ddb329de',
}
for name, digest in expected.items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, 'Base mudou: ' + name

def replace(name, old, new):
    p = root / name
    text = p.read_text()
    assert text.count(old) == 1, (name, old[:80], text.count(old))
    p.write_text(text.replace(old, new))

def replace_block(name, start, end, replacement):
    text = (root / name).read_text()
    a = text.index(start)
    b = text.index(end, a)
    replace(name, text[a:b], replacement)

replace('apps/store.js', '      var gravadoRaw = JSON.stringify(value);\n      localStorage.setItem(PREFIX + key, gravadoRaw);', '      var gravadoRaw = JSON.stringify(value);\n      // Renderizar/normalizar sem mudar o painel não cria edição pendente.\n      // Preserva o carimbo da nuvem para receber novos alunos de outro aparelho.\n      if (key === \'ptStudio\' && localStorage.getItem(PREFIX + key) === gravadoRaw) {\n        leitura(key, value, gravadoRaw); return true;\n      }\n      localStorage.setItem(PREFIX + key, gravadoRaw);')
replace('apps/store.js', "  function guardaRascunho(k, raw) {\n    var nome = 'mtsync:conflito:' + (sync.aid || 'local')", "  function guardaRascunho(k, raw, aid) {\n    var nome = 'mtsync:conflito:' + ((aid === undefined ? sync.aid : aid) || 'local')")
replace_block('apps/store.js', '  function aplicaProtegida(row) {', '  function sinalizaConflito(', (helpers / 'apply-protected.js').read_text())
replace('apps/store.js', '  function notificaChave(k) {', (helpers / 'backup-functions.js').read_text() + '  function notificaChave(k) {')
replace_block('apps/store.js', '  function resolveConflito(k) {', '  function recebeProtegida(', (helpers / 'resolve-conflict.js').read_text())
replace('apps/store.js', "    var baixar = document.createElement('button'); baixar.textContent", "    var baixar = document.createElement('button'); baixar.type = 'button'; baixar.textContent")
replace('apps/store.js', "    var carregar = document.createElement('button'); carregar.textContent", "    var carregar = document.createElement('button'); carregar.type = 'button'; carregar.textContent")
replace('apps/store.js', "        status.textContent = 'Não foi possível resolver agora. Você pode fechar este aviso sem perder o rascunho; a proteção continuará ativa.';", "        status.textContent = 'Não foi possível resolver agora. ' + ((sync.conflitos[k] && sync.conflitos[k].erro) || 'Você pode fechar este aviso sem perder o rascunho; a proteção continuará ativa.');")
p = root / 'assets/personal-torque-one.js'
text = p.read_text()
replace('assets/personal-torque-one.js', text[text.index('/* Central Pro:'):], '')
replace('tests/test-personal-pro-suite.js', "ok(shell.includes('assets/personal-pro-suite.js'), 'shell carrega módulo de forma isolada');", "ok(!shell.includes('assets/personal-pro-suite.js'), 'shell do Personal não carrega a Central Pro');\nok(!shell.includes('ptProSuite'), 'shell não recria o ponto de entrada da Central Pro');")
replace('tests/test-personal-pro-suite.js', "'versão pública inclui a Central Pro (v830 ou posterior)'", "'versão pública preserva a compatibilidade dos dados e da demo (v830 ou posterior)'")
anchor = "  const routes=await p.locator('#abas [data-a]').evaluateAll(els=>els.map(e=>e.dataset.a));"
replace('tests/test-torque-one-layout.js', anchor, "  ok(await p.locator('script[data-pt-pro-suite]').count()===0,'Personal não carrega a Central Pro');\n  ok(await p.getByRole('button',{name:'Central Pro',exact:true}).count()===0,'Central Pro não aparece como destino no painel');\n" + anchor)
for name in ['assets/versao.js', 'sw.js', 'app/app-sw.js']:
    replace(name, 'mt-v831', 'mt-v832')

result = {
    'apps/store.js': 'a07b33b1db4390f18d5a7d84c458acab92b0de8ed215277cae32860b5ee1efcb',
    'assets/personal-torque-one.js': 'dc70f33d26afb2bf16f3a5a40df9d8f23e70cbb87d67d7ef9eca7ebf80620b03',
    'assets/versao.js': '83143822da7f94923e692f7e073f4174f3318be83c410ed8a4a877311ae4535e',
    'sw.js': '9a74641aa3ddf85d76988f8623baaf2b734c28ce0f6dd480c6c7ef93302cd408',
    'app/app-sw.js': '4993fe405ea4cb0bb93c35bbc576622f2e363ea5a1c4292a7440a14ebdfdd0d4',
    'tests/test-personal-pro-suite.js': '07ea963cb4fe02d6c565519dc55767e88d6c49bc5eab28b007288711bdba228a',
    'tests/test-torque-one-layout.js': '77c1a489cd95f8e69faed0ee208ac470d4780c09f9f68f3efbea0f02d094e6ee',
    'tests/test-sync-recuperacao-mobile.js': 'e4f9fc67d8a76be347cdf8e3997d4ae82415d1dc3b5228094d0a480fd73a5015',
    'tests/test-sync-recuperacao-browser.js': '0eb2573ed1caa161d1effa0639f3408b3af6e70405c0389f56558e38b6331e75',
    'docs/releases/mt-v832-sync-mobile-sem-central-pro.md': '509f92eb2d6bc8c542c7c4ba6d0393a282f4be2f83b051a59002a48e97ebb01b',
}
for name, digest in result.items():
    actual = hashlib.sha256((root / name).read_bytes()).hexdigest()
    assert actual == digest, 'Resultado divergiu do código testado: ' + name + ' ' + actual
    print(actual, name)
