from pathlib import Path
import hashlib

expected = {
 'personal.html':'d43bb99245f238a7bc3863eb98c620d9a02f967b9ce0908dbb3a6f9a82e7e161',
 'assets/personal-marca.js':'7c5c1024f74ef374ae06e6ce9b3ac3771a430c77580757ca1b7a4437629c4670',
 'assets/personal-marca.css':'f19bed4f52061c8eb49c170abb3c7b8cf6d8bf8439ddcab3b7fafa15efaa57a0',
 'tests/test-identidade-marca-ui.js':'5a8613b0ae85bbe8474ca52b9c0de6d4eb3c5bd5f4e6de4a13849f87f1a71a8c',
 'docs/releases/mt-v834-identidade-marca.md':'9bb1cd80b2b3028318c59406a3db83cc6837846c0ff4429071228a74512f407a',
}
for name, digest in expected.items():
 assert hashlib.sha256(Path(name).read_bytes()).hexdigest() == digest, 'Base mudou: ' + name

def replace(name, old, new):
 p=Path(name); t=p.read_text()
 assert t.count(old)==1, (name,t.count(old),old[:80])
 p.write_text(t.replace(old,new))

replace('personal.html', 'for="marcaModo">Como você quer aparecer?', 'for="marcaModo">Nome em destaque')
replace('personal.html', '<option value="ambos">Marca + meu nome</option>', '')
replace('personal.html', '<label id="marcaDestaqueCampo" class="ptmarca-wide" for="marcaDestaque" hidden>Qual nome fica em destaque?<select id="marcaDestaque"><option value="estudio">Estúdio / marca em destaque</option><option value="profissional">Profissional em destaque</option></select></label>', '''<label id="marcaSecundarioCampo" class="ptmarca-wide ptmarca-toggle" for="marcaMostrarSecundario" hidden>
              <input id="marcaMostrarSecundario" type="checkbox" aria-describedby="marcaSecundarioAjuda">
              <span><b id="marcaSecundarioRotulo">Mostrar nome do personal abaixo da marca</b><small id="marcaSecundarioAjuda">Opcional. Desligado, aparece só o nome em destaque.</small></span>
            </label>''')
replace('assets/personal-marca.js', "    return { modo: el('marcaModo').value, destaque: el('marcaDestaque').value, profissional: el('marcaProfissional').value,", "    var principal = el('marcaModo').value;\n    // A segunda linha só existe por escolha explícita. Reutiliza os modos\n    // canônicos, sem alterar o pacote, a autoria ou os dados do negócio.\n    var combinado = !!principal && el('marcaMostrarSecundario').checked;\n    return { modo: combinado ? 'ambos' : principal, destaque: principal, profissional: el('marcaProfissional').value,")
replace('assets/personal-marca.js', "    el('marcaDestaqueCampo').hidden = v.modo !== 'ambos';", "    el('marcaSecundarioCampo').hidden = !el('marcaModo').value;\n    el('marcaSecundarioRotulo').textContent = v.destaque === 'profissional'\n      ? 'Mostrar nome do estúdio abaixo do meu nome'\n      : 'Mostrar nome do personal abaixo da marca';")
replace('assets/personal-marca.js', "    el('marcaModo').value = m.v === 1 ? m.modo || '' : '';\n    el('marcaDestaque').value = m.destaque === 'profissional' ? 'profissional' : 'estudio';", "    el('marcaModo').value = m.v === 1\n      ? (m.modo === 'ambos' ? (m.destaque === 'profissional' ? 'profissional' : 'estudio') : m.modo || '') : '';\n    // Preserva uma combinação já escolhida; novas configurações vêm desligadas.\n    el('marcaMostrarSecundario').checked = m.v === 1 && m.modo === 'ambos';")
replace('assets/personal-marca.js', "    form.addEventListener('change', function () { dirty = true; previa(); });", "    form.addEventListener('change', function (e) {\n      // Trocar o destaque não liga uma segunda identidade por efeito colateral.\n      if (e.target.id === 'marcaModo') el('marcaMostrarSecundario').checked = false;\n      dirty = true; previa();\n    });")
replace('assets/personal-marca.css', '.ptmarca-wide{grid-column:1/-1}', '.ptmarca-wide{grid-column:1/-1}\n.ptmarca label.ptmarca-toggle{grid-template-columns:22px minmax(0,1fr);align-items:center;gap:10px;min-height:44px;cursor:pointer}.ptmarca .ptmarca-toggle input[type=checkbox]{width:20px;height:20px;min-height:0;margin:0;padding:0;accent-color:var(--pt-roxo,#8c54f7)}.ptmarca-toggle span{display:grid;gap:4px}.ptmarca-toggle b{font-weight:650}')
# Preserve all prior assertions, changing only how the combined choice is made.
replace('tests/test-identidade-marca-ui.js', " await p.locator('#marcaModo').selectOption('ambos');await p.locator('#marcaEstudio').fill('Studio Horizonte');", " ok(!(await p.locator('#marcaMostrarSecundario').isChecked()),'segunda linha desligada por padrão');\n await p.locator('#marcaModo').selectOption('estudio');await p.locator('#marcaEstudio').fill('Studio Horizonte');")
replace('tests/test-identidade-marca-ui.js', " eq(await p.locator('#marcaPreviewPrincipal').innerText(),'Studio Horizonte','prévia em tempo real');", " eq(await p.locator('#marcaPreviewSecundario').textContent(),'','só marca não cria assinatura automática');\n ok(!(await p.locator('#marcaPreviewSecundario').isVisible()),'segunda linha ausente não reserva espaço na prévia');\n await p.locator('#marcaMostrarSecundario').check();\n eq(await p.locator('#marcaPreviewPrincipal').innerText(),'Studio Horizonte','prévia em tempo real');")
replace('tests/test-identidade-marca-ui.js', "  await p.locator('#marcaModo').selectOption(mode);if(mode==='ambos')await p.locator('#marcaDestaque').selectOption('profissional');await p.locator('#marcaSalvar').click();", "  await p.locator('#marcaModo').selectOption(mode==='ambos'?'profissional':mode);\n  ok(!(await p.locator('#marcaMostrarSecundario').isChecked()),'trocar destaque mantém segunda linha opcional em '+mode);\n  if(mode==='ambos')await p.locator('#marcaMostrarSecundario').check();await p.locator('#marcaSalvar').click();")
replace('tests/test-identidade-marca-ui.js', " eq(dto.identidadeApp.secundario,'Studio Horizonte','combinada com profissional em primeiro');", " eq(dto.identidadeApp.secundario,'Studio Horizonte','combinada com profissional em primeiro');\n await p.locator('#marcaRecarregar').click();ok(await p.locator('#marcaMostrarSecundario').isChecked(),'combinação salva volta ativada sem nova configuração');\n eq(await p.locator('#marcaModo').inputValue(),'profissional','destaque salvo é preservado ao reabrir');")
replace('tests/test-identidade-marca-ui.js', " await p.locator('#marcaModo').selectOption('ambos');await p.locator('#marcaDestaque').selectOption('estudio');await p.locator('#marcaEstudio').fill('Studio Horizonte');await p.locator('#marcaSalvar').click();", " await p.locator('#marcaModo').selectOption('estudio');await p.locator('#marcaMostrarSecundario').check();await p.locator('#marcaEstudio').fill('Studio Horizonte');await p.locator('#marcaSalvar').click();")
replace('tests/test-identidade-marca-ui.js', " if(process.env.TORQUE_EVIDENCE_DIR){", """ // Opt-out após publicação: elimina a linha do DOM, não só a esconde com CSS.
 await p.locator('#marcaMostrarSecundario').uncheck();await p.locator('#marcaSalvar').click();
 dto=await p.evaluate(()=>__dadosApp(__loadPT().alunos[0],new Date().toISOString()));
 eq(dto.identidadeApp.secundario,'','desligar remove o nome secundário do pacote');
 eq(dto.identidadeApp.profissional,'Ana Silva','ocultar nome não apaga a pessoa responsável');
 generated=await getHtml();await student.reload();
 eq(await student.locator('.al-brand-secondary').count(),0,'nenhuma linha secundária nem espaço vazio no template');
 eq(await student.locator('#heroTopo .al-brand-primary').innerText(),'Studio Horizonte','marca permanece em destaque sozinha');
 await p.locator('#marcaRecarregar').click();
 ok(!(await p.locator('#marcaMostrarSecundario').isChecked()),'opção desligada persiste ao reabrir');
 eq(await p.locator('#marcaModo').inputValue(),'estudio','opt-out mantém o destaque escolhido');
 if(process.env.TORQUE_EVIDENCE_DIR){""")
replace('docs/releases/mt-v834-identidade-marca.md', 'Escolher **Meu nome**, **Nome do estúdio / marca** ou **Marca + meu nome**. Na opção combinada, escolher qual nome recebe destaque.', 'Escolher **Meu nome** ou **Nome do estúdio / marca** em **Nome em destaque**. A opção **Mostrar nome do personal abaixo da marca** é desligada por padrão. Quando o profissional é o destaque, o controle permite mostrar o estúdio abaixo. A combinação já salva é preservada; trocar o destaque desliga a segunda linha, que só volta por escolha explícita. Desligar remove a linha do template, sem deixar espaço vazio, e mantém o nome profissional nos registros e assinaturas.')
replace('docs/releases/mt-v834-identidade-marca.md', '## Dados e compatibilidade', 'A interface usa um seletor de destaque e uma opção de segunda linha, sem um segundo seletor redundante. O modo `ambos` continua sendo o contrato interno; não foi criada configuração ou migração adicional.\n\n## Dados e compatibilidade')
result = {
 'personal.html':'60d7ea1748e5ac22713fa6b5cf1f23cd4fde01541b434eaf96b912dfc5bfec5f',
 'assets/personal-marca.js':'3f7e57586e2ec9ddc8e5deef4f6294eceb00eafcb39604671ceb5fa8d4942887',
 'assets/personal-marca.css':'500125e9d11420d74713f443df8fc159e3a35aa0c5f058af5625fe7a8ebb31bf',
 'tests/test-identidade-marca-ui.js':'8388702ab7e8778647a1e28af8746199bbde0a7432148d576d1b9005cf20de18',
 'docs/releases/mt-v834-identidade-marca.md':'87d742638dd3a4d9bbc95a735262286e65c656907f529c378132723f6f1c82f7',
}
for n,digest in result.items():
 actual=hashlib.sha256(Path(n).read_bytes()).hexdigest()
 assert actual==digest, 'Resultado divergente: '+n
 print(actual,n)
