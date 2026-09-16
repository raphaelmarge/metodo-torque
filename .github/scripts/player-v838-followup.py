from pathlib import Path
import re

def replace(path, old, new):
    p=Path(path);s=p.read_text()
    if s.count(old)!=1: raise RuntimeError(f'{path}: trecho inesperado ({s.count(old)}): {old[:90]}')
    p.write_text(s.replace(old,new))

# Inclui as páginas de cenários guardadas em objetos (pulado.p, novo.p, erro.p).
p=Path('tests/test-aluno-player-experiencia.js');s=p.read_text()
s=re.sub(r"await ([\w.]+)\.click\('(\#(?:gSerie|gSemRegistro|gSalvar|gDesfazSerie|gPulaEx2))'\)",r"await clicarControle(\1, '\2')",s)
s=re.sub(r"await ([\w.]+)\.fill\('(\#(?:gKg|gReps))',\s*([^;]+?)\)",r"await preencherRegistro(\1, '\2', \3)",s)
p.write_text(s)

# O teste de ponta a ponta do Personal também precisa abrir a série antes de
# arrastar as réguas. As verificações de volume, duplicação e persistência ficam.
replace('tests/test-personal.js', 'const fs = require("fs");', 'const fs = require("fs");\nconst { abrirRegistro } = require("./helpers/player-template.js");')
replace('tests/test-personal.js', '    const carga = await pApp.evaluate(async () => {\n      const bt = () => document.getElementById("gPular");', '    await pApp.evaluate(async () => {\n      const bt = () => document.getElementById("gPular");')
replace('tests/test-personal.js', '      if (!document.getElementById("gKg")) return null;\n      const ajuste = document.getElementById(\'gWKg\').closest(\'details\');', '    });\n    await abrirRegistro(pApp);\n    const carga = await pApp.evaluate(async () => {\n      if (!document.getElementById("gKg")) return null;\n      const ajuste = document.getElementById(\'gWKg\').closest(\'details\');')
# O identificador do template acompanha a mudança de runtime desta correção.
replace('app/aluno-skin.js', "window.__playerTemplate={version:'mt-v837'", "window.__playerTemplate={version:'mt-v838'")

# O ocultamento dos blocos antigos é só do exercício, nunca do recibo final.
# Restringir o seletor mantém inclusive os displays flex/grid e hidden originais.
replace('app/aluno-skin.js', '#guiaBox.player-template #gMiolo>:not(.gseries-nav)', '#guiaBox.player-template:not(.gpt-finished) #gMiolo>:not(.gseries-nav)')
replace('app/aluno-skin.js', '#guiaBox.player-template.gpt-finished #gMiolo>*{display:revert!important}', '')
replace('app/aluno-skin.js', 'if(fresh){var technique=', 'if(fresh&&!c.s.fim){var technique=')
replace('app/aluno-skin.js', '#gTemplateFavorite,#gTemplateBottom){display:none!important}', '#gTemplateFavorite,#gTemplateBottom,#gTemplateHero){display:none!important}#guiaBox.player-template.gpt-finished #gMiolo2:empty{display:none!important}')
old="   ok(await q.isVisible('#gFim') && await q.locator('#gFim').evaluate(b=>b.getBoundingClientRect().height>=58),width+' '+theme+': recibo preserva fechamento destacado');"
new=old+"\n   ok(await q.locator('#gMiolo .wtile2').first().isVisible() && await q.locator('#gMiolo .rperow').isVisible() && /Séries feitas aqui.*Cargas anotadas.*Tempo de treino/s.test(await q.locator('#gMiolo').innerText()),width+' '+theme+': recibo mostra de fato os dados, resumo e esforço');\n   ok(!await q.isVisible('#gTemplateHero') && !await q.isVisible('#gMiolo2'),width+' '+theme+': conclusão não deixa cartões vazios do exercício');"
replace('tests/test-aluno-template-player.js',old,new)
p=Path('docs/releases/mt-v838-player-publicacao.md');p.write_text(p.read_text()+ '\nO recibo final também deixa de herdar o ocultamento dos blocos do exercício. Seu resumo não é transferido para a aba de instruções; os testes verificam visibilidade real dos dados, do esforço e ausência de cartões vazios em seis tamanhos/temas.\n')
