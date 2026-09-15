from pathlib import Path
import hashlib
p=Path('personal.html')
s=p.read_text()
assert hashlib.sha256(p.read_bytes()).hexdigest()=='0a488c7cf1cbbe9b9f831b017ae2a92f052d9a40a4d01d0d23c0d246452d79ed'
anchor='  .ajpassos li::before {'
assert s.count(anchor)==1
s=s.replace(anchor, '  /* Atalhos da ajuda respeitam a largura útil do passo no celular. */\n  #vAjuda .ajpassos [data-ajtopico] { box-sizing: border-box; max-width: 100%; min-width: 0; height: auto; min-height: 44px; white-space: normal; overflow-wrap: anywhere; padding-top: 8px; padding-bottom: 8px; margin: 4px 0; }\n  #vAjuda .ajsec summary::after { width: 20px; height: 20px; line-height: 20px; text-align: center; top: 12px; }\n'+anchor)
p.write_text(s)
assert hashlib.sha256(p.read_bytes()).hexdigest()=='e8f33564b6f8588587a15a0d2d191bda2949465b0797a022a2a56bd8bd772a2e'
print('personal.html',hashlib.sha256(p.read_bytes()).hexdigest())
p=Path('tests/test-ajuda-atualizada-ui.js');s=p.read_text()
a="        const fits = await p.locator('#vAjuda').evaluate(e=>e.scrollWidth<=e.clientWidth+1);"
b="""        // Os cartões têm animação de entrada. Medir após a geometria final,
        // sem desativar estilos nem ignorar conteúdo que exceda a tela.
        await p.locator('#vAjuda').evaluate(e=>Promise.all(e.getAnimations({subtree:true}).filter(a=>Number.isFinite(a.effect.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{}))));
        const fits = await p.locator('#vAjuda').evaluate(e=>e.scrollWidth<=e.clientWidth+1);"""
assert s.count(a)==1;s=s.replace(a,b)
a="          console.error('Elementos excedentes', await p.locator('#vAjuda').evaluate(e=>{"
b="""          console.error('Dimensões da ajuda', await p.locator('#vAjuda').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth,rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display,before:getComputedStyle(e,'::before').content,after:getComputedStyle(e,'::after').content,children:Array.from(e.children).map(x=>({tag:x.tagName,cls:x.className,client:x.clientWidth,scroll:x.scrollWidth,rect:x.getBoundingClientRect().toJSON()}))})));
          console.error('Elementos excedentes', await p.locator('#vAjuda').evaluate(e=>{"""
assert s.count(a)==1;s=s.replace(a,b);p.write_text(s)
print('tests/test-ajuda-atualizada-ui.js',hashlib.sha256(p.read_bytes()).hexdigest())
