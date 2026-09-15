from pathlib import Path
import hashlib
p=Path('personal.html')
s=p.read_text()
assert hashlib.sha256(p.read_bytes()).hexdigest()=='0a488c7cf1cbbe9b9f831b017ae2a92f052d9a40a4d01d0d23c0d246452d79ed'
anchor='  .ajpassos li::before {'
assert s.count(anchor)==1
s=s.replace(anchor, '  /* Atalhos da ajuda respeitam a largura útil do passo no celular. */\n  #vAjuda .ajpassos [data-ajtopico] { box-sizing: border-box; max-width: 100%; min-width: 0; height: auto; min-height: 44px; white-space: normal; overflow-wrap: anywhere; padding-top: 8px; padding-bottom: 8px; margin: 4px 0; }\n'+anchor)
p.write_text(s)
assert hashlib.sha256(p.read_bytes()).hexdigest()=='29eb4751175c17b55199349fb897c7182f30d5f9c13ab0f63fa4f5c20f4d6296'
print('personal.html',hashlib.sha256(p.read_bytes()).hexdigest())
