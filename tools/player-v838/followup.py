from pathlib import Path
import re

def replace(path, old, new):
    p=Path(path);s=p.read_text()
    if s.count(old)!=1:raise SystemExit(f'{path}: replacement is ambiguous or absent: {old[:80]}')
    p.write_text(s.replace(old,new))

# Legacy content belongs in tabs only while exercising, not in the receipt.
replace('app/aluno-skin.js',
'#guiaBox.player-template #gMiolo>:not(.gseries-nav):not(.gpt-series-title):not(.gserie-review)',
'#guiaBox.player-template:not(.gpt-finished) #gMiolo>:not(.gseries-nav):not(.gpt-series-title):not(.gserie-review)')
replace('app/aluno-skin.js',
"box.classList.toggle('gpt-closing',closing);",
"box.classList.toggle('gpt-closing',closing);box.classList.toggle('gpt-receipt',finished&&!!$('gFim'));if(finished&&!!$('gFim'))$('gTemplatePosition').textContent='Resumo do treino';")
replace('app/aluno-skin.js',
'#guiaBox.player-template.gpt-finished #gMiolo{order:4}',
'#guiaBox.player-template.gpt-finished #gMiolo{order:4}#guiaBox.player-template.gpt-receipt #gTemplateHero,#guiaBox.player-template.gpt-receipt #gMiolo2{display:none!important}')
replace('app/aluno-skin.js','#guiaBox.player-template.gpt-finished #gMiolo>*{display:revert!important}','')

# Retain every data assertion; access relocated controls via the visible UI.
p=Path('tests/test-series-prescricao.js');s=p.read_text()
s="const { clickPlayer } = require('./helpers/player-controls');\n"+s
s=re.sub(r"await ([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\.click\('(#[^']+)'\)",lambda m:"await clickPlayer("+m[1]+", '"+m[2]+"')" if m[2] in ['#gSemRegistro','#gPulaEx2'] else m[0],s)
p.write_text(s)
replace('tests/test-aluno-template-fechamento.js',
"ok(await p.isVisible('#gFim')&&await p.isVisible('#gRevisaoSeries'),rest+' s: conclusão explícita abre recibo completo');",
"ok(await p.isVisible('#gFim')&&await p.isVisible('#gRevisaoSeries'),rest+' s: conclusão explícita abre recibo completo');\n   ok(/Treino concluído|Meta da semana batida/i.test(await p.locator('#gMiolo').innerText())&&await p.locator('#gMiolo [data-rpe]').first().isVisible(),rest+' s: título, resumo e esforço final aparecem de verdade, não apenas no DOM');")
