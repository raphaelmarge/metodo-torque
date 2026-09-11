from pathlib import Path
p=Path('tests/test-relatorio-0809-browser.js')
s=p.read_text()
a="p.locator('[data-abreperfil=\"'+id+'\"]')"
b="p.locator('#listaAlunos [data-abreperfil=\"'+id+'\"]')"
assert s.count(a)==1
s=s.replace(a,b)
a="if(!await p.locator('#pfPagamentosHistorico').evaluate(e=>e.open))"
s=s.replace(a+a,a)
p.write_text(s)
