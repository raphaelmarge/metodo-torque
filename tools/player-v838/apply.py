from pathlib import Path
import re

def replace(path, old, new, count=1):
    p=Path(path); text=p.read_text()
    found=text.count(old)
    if found != count: raise SystemExit(f'{path}: expected {count} occurrences, got {found}: {old[:100]}')
    p.write_text(text.replace(old,new))

# Preserve canonical closing controls and the next editable zero-rest series.
replace('app/aluno-skin.js',
'#guiaBox.player-template.gpt-review #gMiolo2,#guiaBox.player-template.gpt-review #gPe,#guiaBox.player-template.gpt-review #gTemplatePanel-video{display:none!important}',
'#guiaBox.player-template.gpt-review:not(.gpt-closing) #gMiolo2,#guiaBox.player-template.gpt-review:not(.gpt-closing) #gPe,#guiaBox.player-template.gpt-review #gTemplatePanel-video{display:none!important}')
replace('app/aluno-skin.js',
"var finished=!!c.s.fim;box.classList.toggle('gpt-review',mode==='sets'&&!finished);box.classList.toggle('gpt-finished',finished);",
"var finished=!!c.s.fim,closing=!finished&&window.GP.conta(c.it,c.ei)>=c.it.s;box.classList.toggle('gpt-review',mode==='sets'&&!finished);box.classList.toggle('gpt-finished',finished);box.classList.toggle('gpt-closing',closing);")
replace('app/aluno-skin.js',
"window.GP.conclui=function(){var c=current(),before=c.it&&window.GP.conta(c.it,c.ei),value=confirmSet.apply(this,arguments);if(c.it&&window.GP.conta(c.it,c.ei)>before && current().s.e===c.ei)mode='sets';render();return value;};",
"window.GP.conclui=function(){var c=current(),before=c.it&&window.GP.conta(c.it,c.ei),value=confirmSet.apply(this,arguments),after=current();if(c.it&&window.GP.conta(c.it,c.ei)>before&&after.s.e===c.ei)mode=(window.GP.conta(c.it,c.ei)>=c.it.s||after.s.descAte>Date.now())?'sets':'entry';render();return value;};")
replace('app/aluno-skin.js',
"var form=box.querySelector('.gserie-form');if(!form)return;",
"var form=box.querySelector('.gserie-form');if(!form)return;\n        var fields=form.querySelector('.gserie-fields');if(fields){var load=fields.querySelector('[for=gKg]');if(load&&fields.firstElementChild!==load)fields.insertBefore(load,fields.firstElementChild);}")
replace('app/aluno-skin.js',"version:'mt-v837',render:render", "version:'mt-v838',render:render")

# Follow visible navigation of the approved tabs, retaining all data assertions.
for path in ['tests/test-acompanhamento.js','tests/test-aluno-player-experiencia.js','tests/test-aluno-series-praticas.js']:
    p=Path(path); text="const { clickPlayer } = require('./helpers/player-controls');\n"+p.read_text()
    text=re.sub(r"await ([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.click\('(#[^']+)'\)",
        lambda m: "await clickPlayer("+m[1]+", '"+m[2]+"')" if m[2] in ['#gSemRegistro','#gVoz','#gPulaEx2','#acRelatar'] else m[0],text)
    p.write_text(text)
replace('tests/test-acompanhamento.js',
"ok((await pa.textContent('#gMiolo')).includes('aprovadas'),'alternativa do professor tem origem explícita');",
"await pa.click('#gTemplateTab-instructions');await pa.click('#gTemplatePanel-instructions .altbtn');\n  ok((await pa.locator('#gTemplatePanel-instructions').innerText()).includes('alternativas aprovadas pelo seu personal'),'alternativa do professor tem origem explícita e é acessível na aba Instruções');")
for old,new in [
("(await p.locator('.gserie-context').innerText()).includes('90 s de descanso')", "(await p.locator('#gTemplatePrescription').innerText()).includes('90 s')"),
("(await p.locator('.gserie-context').innerText()).includes('75 s de descanso')", "(await p.locator('#gTemplatePrescription').innerText()).includes('75 s')"),
("(await p.locator('.gserie-context').innerText()).includes('0 s de descanso') && !(await p.locator('.gserie-context').innerText()).includes('Prescrito:')", "(await p.locator('#gTemplatePrescription').innerText()).includes('0 s') && await p.locator('#gTemplatePrescription dd').first().innerText() === '—'")]:
    replace('tests/test-aluno-player-experiencia.js',old,new)
replace('tests/test-aluno-series-praticas.js',
"const a=document.getElementById('gReps'),b=document.getElementById('gKg');",
"const a=document.getElementById('gKg'),b=document.getElementById('gReps');")
replace('tests/test-aluno-series-praticas.js',
"'repetições vêm primeiro no DOM e à esquerda no celular'", "'carga vem primeiro no DOM e à esquerda, seguida de repetições, como no template aprovado'")
replace('tests/test-aluno-series-praticas.js',
"(await p.textContent('#gSerie')).includes('Série feita')", "(await p.textContent('#gSerie')).includes('Registrar série')")
replace('tests/test-aluno-series-praticas.js',
"(await faixa.locator('.gserie-context').textContent()).includes('carga não informada')", "await faixa.locator('#gTemplatePrescription dd').first().innerText()==='—'")
replace('tests/test-aluno-template-player.js',
"const {dados} = require('./test-aluno-player-experiencia');",
"const {dados} = require('./test-aluno-player-experiencia');\nconst {clickPlayer} = require('./helpers/player-controls');")
replace('tests/test-aluno-template-player.js',
"const click=async selector=>{await p.locator(selector).evaluate(n=>{for(let a=n.parentElement;a;a=a.parentElement)if(a.tagName==='DETAILS')a.open=true;});await p.click(selector);};",
"const click=selector=>clickPlayer(p,selector);")
replace('app/aluno-skin.js',
'#guiaBox.player-template.festa{--gfg:var(--gpt-text);',
'#guiaBox.player-template.festa{background:radial-gradient(120% 62% at 50% 0,rgba(255,255,255,.18),transparent 58%),radial-gradient(90% 52% at 50% 100%,rgba(13,12,16,.18),transparent 72%),linear-gradient(180deg,var(--cor) 0%,var(--cor2) 100%)!important;--gfg:var(--gpt-text);')
replace('app/aluno-skin.js',
'#guiaBox.player-template.festa .gserie-form{',
'#guiaBox.player-template.festa #gPe #gFim{background:#fff!important;color:var(--cor-esc,#3b2b63)!important;min-height:58px;border-color:#fff}\\n#guiaBox.player-template.festa .gserie-form{')
for path in ['assets/versao.js','app/app-sw.js','sw.js']:
    replace(path,'"mt-v837"','"mt-v838"')
