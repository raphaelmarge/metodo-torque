from pathlib import Path
import re

def replace(path, old, new, count=1):
    p=Path(path); s=p.read_text()
    if s.count(old)!=count: raise RuntimeError(f'{path}: esperado {count}, recebido {s.count(old)} para {old[:80]!r}')
    p.write_text(s.replace(old,new))

# Mantém a revisão aprovada sem esconder a ação de concluir o treino.
replace('app/aluno-skin.js', '.player-template.gpt-review #gPe,', '.player-template.gpt-review:not(.gpt-complete) #gPe,')
replace('app/aluno-skin.js', "var finished=!!c.s.fim;box.classList.toggle('gpt-review',mode==='sets'&&!finished);box.classList.toggle('gpt-finished',finished);", "var finished=!!c.s.fim;box.classList.toggle('gpt-review',mode==='sets'&&!finished);box.classList.toggle('gpt-finished',finished);box.classList.toggle('gpt-complete',!!$('gFecharTreino')&&!finished);")
# O recibo final mantém a aparência e o fechamento destacados já existentes.
replace('app/aluno-skin.js', 'background:var(--gpt-bg)!important;color:var(--gpt-text)', 'background-color:var(--gpt-bg)!important;color:var(--gpt-text)')
replace('app/aluno-skin.js', '#guiaBox.player-template #gGif{border:0!important}', '#guiaBox.player-template #gGif{border:0!important}#guiaBox.player-template.festa #gPe #gFim{min-height:58px;background:#fff!important;color:var(--cor2)!important}')

Path('tests/helpers').mkdir(exist_ok=True)
Path('tests/helpers/player-template.js').write_text('''/* Navegação real do template aprovado. Não grava dados nem força cliques ocultos. */
'use strict';
async function abrirRegistro(page) {
  if (!await page.locator('#gKg').count() || await page.isVisible('#gKg')) return;
  const index = await page.evaluate(() => {
    const s = window.__gvDe(), f = window.GUIA[s.f];
    const it = f && f.it[Math.min(s.e, f.it.length - 1)];
    return it ? window.SR.indice(it) : null;
  });
  if (index == null) throw new Error('Nenhuma série disponível para abrir o registro');
  await page.locator('[data-gserie="' + index + '"]').click();
  await page.locator('#gKg').waitFor({ state: 'visible' });
}
async function clicarControle(page, selector) {
  await abrirRegistro(page);
  const control = page.locator(selector);
  const parents = control.locator('xpath=ancestor::details');
  for (let i = 0; i < await parents.count(); i++) {
    const parent = parents.nth(i);
    if (!await parent.evaluate(e => e.open)) await parent.locator(':scope > summary').click();
  }
  await control.click();
}
async function preencherRegistro(page, selector, value) {
  await abrirRegistro(page);
  await page.fill(selector, value);
}
module.exports = { abrirRegistro, clicarControle, preencherRegistro };
''')
for filename in ['test-aluno-series-praticas.js','test-aluno-player-experiencia.js','test-acompanhamento.js']:
    p=Path('tests')/filename; s=p.read_text()
    s=s.replace("const assert = require('assert/strict');", "const assert = require('assert/strict');\nconst { abrirRegistro, clicarControle, preencherRegistro } = require('./helpers/player-template.js');")
    s=re.sub(r"await (\w+)\.click\('(\#(?:gSerie|gSemRegistro|gSalvar|gDesfazSerie))'\)",r"await clicarControle(\1, '\2')",s)
    s=re.sub(r"await (\w+)\.fill\('(\#(?:gKg|gReps))',\s*([^;]+?)\)",r"await preencherRegistro(\1, '\2', \3)",s)
    p.write_text(s)

p=Path('tests/test-aluno-series-praticas.js');s=p.read_text()
s=s.replace("const a=document.getElementById('gReps'),b=document.getElementById('gKg');", "const a=document.getElementById('gKg'),b=document.getElementById('gReps');")
s=s.replace("'repetições vêm primeiro no DOM e à esquerda no celular'", "'carga vem primeiro no DOM e à esquerda no celular'")
s=s.replace("includes('Série feita')", "includes('Registrar série')")
s=s.replace("(await faixa.locator('.gserie-context').textContent()).includes('carga não informada')", "(await faixa.locator('#gTemplatePrescription dd').nth(0).innerText())==='—'")
s=s.replace("(await faixa.locator('#gTemplatePrescription').textContent()).includes('—')", "(await faixa.locator('#gTemplatePrescription dd').nth(0).innerText())==='—'")
s=s.replace('três toques registram três séries distintas, sem digitação','três confirmações, com seleção das séries, registram execuções distintas sem digitação')
p.write_text(s)
replace('tests/test-aluno-player-experiencia.js', "(await p.locator('.gserie-context').innerText()).includes('90 s de descanso')", "(await p.locator('#gTemplatePrescription dd').nth(3).innerText()) === '90 s'")
replace('tests/test-aluno-player-experiencia.js', "(await p.locator('.gserie-context').innerText()).includes('75 s de descanso')", "(await p.locator('#gTemplatePrescription dd').nth(3).innerText()) === '75 s'")
replace('tests/test-aluno-player-experiencia.js', "(await p.locator('.gserie-context').innerText()).includes('0 s de descanso') && !(await p.locator('.gserie-context').innerText()).includes('Prescrito:')", "(await p.locator('#gTemplatePrescription dd').nth(3).innerText()) === '0 s' && (await p.locator('#gTemplatePrescription dd').nth(0).innerText()) === '—'")
replace('tests/test-aluno-player-experiencia.js', "ok(await pf.isVisible('#gWRep') && await pf.isVisible('#gWKg') && await pf.isVisible('#gSalvar'), 'fim do exercício intermediário expõe", "await abrirRegistro(pf);\n    ok(await pf.isVisible('#gWRep') && await pf.isVisible('#gWKg') && await pf.isVisible('#gSalvar'), 'editar a série do exercício intermediário expõe")
replace('tests/test-aluno-player-experiencia.js', "ok(await pf.isVisible('#gWRep') && await pf.isVisible('#gWKg') && await pf.isVisible('#gSalvar') && await pf.isVisible('#gFecharTreino'),", "await abrirRegistro(pf);\n    ok(await pf.isVisible('#gWRep') && await pf.isVisible('#gWKg') && await pf.isVisible('#gSalvar') && await pf.isVisible('#gFecharTreino'),")
replace('tests/test-acompanhamento.js', "ok((await pa.textContent('#gMiolo')).includes('aprovadas'),'alternativa do professor tem origem explícita');", "await pa.click('#gTemplateTab-instructions');\n  ok((await pa.locator('#gTemplatePanel-instructions .galt').innerText()).includes('aprovadas'),'alternativa do professor tem origem explícita na aba de instruções');")
replace('tests/test-acompanhamento.js', "await pa.click('#acRelatar');", "await pa.click('#gTemplateTab-tips');await pa.click('#acRelatar');")

for filename in ['assets/versao.js','sw.js','app/app-sw.js']:
    p=Path(filename);s=p.read_text()
    if 'mt-v837' not in s: raise RuntimeError('Versão inesperada: '+filename)
    p.write_text(s.replace('mt-v837','mt-v838'))
Path('docs/releases/mt-v838-player-publicacao.md').write_text('''# mt-v838 — conclusão do player e contrato de testes

Mantém o template aprovado: carga, repetições e RPE opcional; prescrição e histórico separados; confirmação explícita e tabela de séries.

Corrige o rodapé de revisão que escondia **Terminar treino** após a última série. Preserva o recibo final e o botão de fechamento destacado. As suítes legadas passam a navegar pelas abas e abrir o registro pela série selecionada, sem cliques forçados ou alteração artificial do estado. Descanso e carga ausente são verificados nos campos corretos da prescrição.

Sem migração SQL, alteração de autenticação, políticas, tabelas ou dados reais. Os testes usam fixtures sintéticas e nuvem interceptada. A publicação continua condicionada à suíte completa e à confirmação do commit servido pelo GitHub Pages.
''')
replace('tests/test-aluno-template-player.js', "await click('#gSerie');await click('#gPularEx');\n  ok(await p.isVisible('#gRevisaoSeries')", "await click('#gSerie');\n  ok(await p.isVisible('#gFecharTreino'),'última série mantém Terminar treino visível na revisão');\n  await click('#gFecharTreino');\n  ok(await p.isVisible('#gRevisaoSeries')")
replace('tests/test-aluno-template-player.js', "ok(x.errors.length===0,width+' '+theme+': nenhuma exceção');", """await x.click('#gPularEx');
   await q.fill('#gKg','0');await q.fill('#gReps','12');await x.click('#gSerie');
   ok(await q.isVisible('#gFecharTreino'),width+' '+theme+': término disponível sem sair da revisão');
   ok(await q.locator('#gFecharTreino').evaluate(b=>{const r=b.getBoundingClientRect();return r.height>=44&&r.top>=0&&r.bottom<=innerHeight+1;}),width+' '+theme+': término alcançável na tela');
   await x.click('#gFecharTreino');
   ok(await q.isVisible('#gFim') && await q.locator('#gFim').evaluate(b=>b.getBoundingClientRect().height>=58),width+' '+theme+': recibo preserva fechamento destacado');
   ok(x.errors.length===0,width+' '+theme+': nenhuma exceção');""")
