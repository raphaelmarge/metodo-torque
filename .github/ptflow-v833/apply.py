from pathlib import Path


def one(path, old, new):
    p = Path(path)
    text = p.read_text(encoding='utf-8')
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{path}: esperado 1 trecho, encontrado {count}: {old[:100]!r}')
    p.write_text(text.replace(old, new), encoding='utf-8')

# Integra a camada ao Personal existente, sem criar destino de menu separado.
one('personal.html',
    '<link href="assets/personal-torque-one.css" rel="stylesheet">\n<script defer src="assets/personal-gestao.js"></script>',
    '<link href="assets/personal-torque-one.css" rel="stylesheet">\n<link href="assets/personal-fluxo.css" rel="stylesheet">\n<script defer src="assets/personal-gestao.js"></script>')
one('personal.html',
    '<script defer src="assets/personal-torque-one.js"></script>\n</head>',
    '<script defer src="assets/personal-torque-one.js"></script>\n<script defer src="assets/personal-fluxo.js"></script>\n</head>')
one('personal.html',
    '  window.__perfilPT = abrePerfil; // testes',
    '  window.__perfilPT = abrePerfil; // testes\n  window.__perfilAtualPT = function () { return perfilId || ""; }; // integração do fluxo diário')

# Cache/versionamento. A versão precisa mudar nos bytes dos dois service workers.
one('sw.js', 'var VERSION = "mt-v832";', 'var VERSION = "mt-v833";')
one('sw.js',
    '  "assets/personal-torque-one.css",\n  "assets/personal-torque-one.js",',
    '  "assets/personal-torque-one.css",\n  "assets/personal-torque-one.js",\n  "assets/personal-fluxo.css",\n  "assets/personal-fluxo.js",')
one('app/app-sw.js', 'var VERSION = "mt-v832";', 'var VERSION = "mt-v833";')

# Guardas mínimas contra regressão acidental.
html = Path('personal.html').read_text(encoding='utf-8')
assert html.count('assets/personal-fluxo.js') == 1
assert html.count('assets/personal-fluxo.css') == 1
assert 'window.__perfilAtualPT' in html
sw = Path('sw.js').read_text(encoding='utf-8')
assert '"assets/personal-fluxo.js"' in sw and '"assets/personal-fluxo.css"' in sw
print('Integração v833 aplicada com sucesso.')
