from pathlib import Path
import hashlib
before={'assets/personal-estornos.js':'c809f501145c22faa16fc4fd40d334c58718225074d8e2727a10348999e48e1b','tests/test-identidade-marca-ui.js':'1c192217fd874b1ba93c958d81d7c3ec5806df316420e9263227da8224c79396'}
for f,h in before.items(): assert hashlib.sha256(Path(f).read_bytes()).hexdigest()==h,'Base mudou: '+f

def rep(f,a,b):
 p=Path(f);s=p.read_text();assert s.count(a)==1,(f,a[:100],s.count(a));p.write_text(s.replace(a,b))
# Mesmo destino e nome acessível completo; rótulo visível cabe na ação móvel.
rep('assets/personal-estornos.js','class="btn sec mini" data-pt-estorno=', 'class="btn sec mini" aria-label="Devolução / estorno" title="Devolução / estorno" data-pt-estorno=')
rep('assets/personal-estornos.js','>Devolução / estorno</button>', '>Devolução</button>')
# textContent verifica o conteúdo real mesmo se o Financeiro estiver numa subaba
# com o resumo recolhido; mesma leitura usada pelo contrato do Personal existente.
a=" ok((await p.locator('#pgHoje').innerText()).includes('Entrou hoje:')&&(await p.locator('#pgHoje').innerText()).includes('Devolvido hoje:'),'movimento diário mantém entradas e devoluções separadas');"
b=" const diario=await p.locator('#pgHoje').textContent();\n ok(diario.includes('Entrou hoje:')&&diario.includes('Devolvido hoje:'),'movimento diário mantém entradas e devoluções separadas: '+diario);"
rep('tests/test-identidade-marca-ui.js',a,b)
after={'assets/personal-estornos.js':'7c5cabee751def33fa8032798605989d5985b14700f88503f067244649eed83a','tests/test-identidade-marca-ui.js':'5a8613b0ae85bbe8474ca52b9c0de6d4eb3c5bd5f4e6de4a13849f87f1a71a8c'}
for f,h in after.items():
 actual=hashlib.sha256(Path(f).read_bytes()).hexdigest();assert actual==h,f+' '+actual;print(actual,f)
