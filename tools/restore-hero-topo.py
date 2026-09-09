from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.cwd()

def blob_sha(data):
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()

expected = {
    'app/aluno-skin.js': 'da80db601e5b45033eb47d0523fed33b8ff69de3',
    'assets/versao.js': '0cd66b15ea7c5344749846b218e0f9c9e262305c',
    'sw.js': 'd8ea3a4e1e281345bead34de35e57124c2a78ec0',
    'app/app-sw.js': '7520583c240754a34dcf04af74d69c1946ff7919',
    'CLAUDE.md': 'f65850b153f87d9c33e27238c6bc74a024363e4f',
}
for name, sha in expected.items():
    assert blob_sha((ROOT / name).read_bytes()) == sha, 'Base mudou: ' + name

skin = ROOT / 'app/aluno-skin.js'
source = skin.read_text()
marker = '  var js = "";'
assert source.count(marker) == 1, 'Ponto de inserção da skin mudou; revisar antes de aplicar.'
assert 'v817 — Foto no topo' not in source, 'Correção já aplicada.'
rules = [
    '@media(max-width:800px){',
    'body.aluno-v793:has(#heroCarr) #blocoHoje{padding-top:0}',
    'body.aluno-v793 #heroCarr{width:100%!important;margin:0!important;margin-inline:0!important;padding:0!important;gap:0!important;border-radius:0}',
    'body.aluno-v793 #heroCarr>div{height:clamp(470px,64vh,570px)!important;height:clamp(470px,64svh,570px)!important;border-radius:0!important;background:var(--one-bg,var(--bg0))!important}',
    'body.aluno-v793:has(#heroCarr) #heroTopo{padding:calc(18px + env(safe-area-inset-top,0px)) 20px 0!important;align-items:flex-start!important}',
    'body.aluno-v793:has(#heroCarr) #heroTopo>div>div:first-child{color:rgba(255,255,255,.82)!important;text-shadow:0 1px 12px rgba(0,0,0,.35)}',
    'body.aluno-v793:has(#heroCarr) #heroSauda{color:#fff!important;font-size:clamp(22px,6.5vw,27px)!important;overflow-wrap:anywhere;text-shadow:0 1px 16px rgba(0,0,0,.35)}',
    'body.aluno-v793:has(#heroCarr) :is(#sinoBtn,#avBtn2){background:rgba(12,13,17,.4)!important;border-color:rgba(255,255,255,.3)!important;color:#fff!important;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}',
    'body.aluno-v793 #heroCarr>div>img{object-fit:cover;object-position:center}',
    "body.aluno-v793 #heroCarr>div>div[style*='pointer-events:none'][style*='linear-gradient(180deg']{background:linear-gradient(180deg,rgba(12,13,17,.66) 0%,rgba(12,13,17,.08) 30%,rgba(12,13,17,.16) 42%,rgba(12,13,17,.4) 55%,rgba(12,13,17,.72) 68%,rgba(12,13,17,.9) 82%,var(--one-bg,var(--bg0)) 100%)!important}",
    "html.claro body.aluno-v793 #heroCarr>div>div[style*='pointer-events:none'][style*='linear-gradient(180deg']{background:linear-gradient(180deg,rgba(12,13,17,.66) 0%,rgba(12,13,17,.08) 28%,rgba(244,243,247,.12) 38%,rgba(244,243,247,.84) 58%,rgba(244,243,247,.97) 76%,var(--one-bg) 100%)!important}",
    'html.claro body.aluno-v793 #heroCarr :is(.htit,#htTitulo){color:var(--one-text)!important}html.claro body.aluno-v793 #heroCarr .hsub{color:var(--one-muted)!important}html.claro body.aluno-v793 #heroCarr .htk2{color:var(--cor)!important}',
    '}'
]
addition = '''  /* v817 — Foto no topo, de ponta a ponta, como no Início original.
   * Só apresentação no celular: mantém carrossel, imagens, destinos e dados.
   * Depois da composição v816 para que suas margens não encolham a foto.
   * svh evita saltos quando a barra do Safari recolhe; vh é o fallback.
   * O desktop com sidebar e o primeiro dia sem carrossel não mudam.
   */
  css += [
''' + ',\n'.join('    ' + json.dumps(r, ensure_ascii=False) for r in rules) + '\n  ].join("");\n'
skin.write_text(source.replace(marker, addition + marker))
for name in ('assets/versao.js', 'sw.js', 'app/app-sw.js'):
    p = ROOT / name
    text = p.read_text()
    assert text.count('mt-v816') == 1, f'Versão de {name} mudou; revisar antes de aplicar.'
    p.write_text(text.replace('mt-v816', 'mt-v817'))
p = ROOT / 'CLAUDE.md'
text = p.read_text()
anchor = '## v811 — Nutrição integrada ao Personal (adição solicitada pelo Raphael)'
assert text.count(anchor) == 1
note = '''## v817 — Foto grande no topo do aluno

- No celular (até 800px), o carrossel volta a começar no topo e ocupar toda a largura do app, sem margens ou cantos de cartão. Saudação, sino e avatar ficam sobre a foto, com safe area e contraste nos dois temas.
- A altura original volta com `svh` e fallback `vh`; a imagem usa `object-fit:cover`, sem deformar. O degradê termina na cor atual da página. Preservar o carrossel, os indicadores, as ações, Minha semana e os hábitos.
- Mudança somente em `app/aluno-skin.js`; não reescrever builder, sincronização, pacotes ou Supabase. Desktop Torque One e primeiro dia sem treino mantêm a estrutura anterior.
- Regenerar `demo-aluno.html`. Teste de regressão em `tests/test-aluno-hero-full-bleed.js`, além das suítes existentes do Início e de prescrição/sincronização.

'''
p.write_text(text.replace(anchor, note + anchor))
for name in ('app/aluno-skin.js','assets/versao.js','sw.js','app/app-sw.js','CLAUDE.md'):
    print(name, blob_sha((ROOT/name).read_bytes()))
