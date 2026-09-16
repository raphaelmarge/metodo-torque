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
