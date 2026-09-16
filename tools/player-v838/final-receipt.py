from pathlib import Path

def replace(path, old, new):
    p=Path(path);s=p.read_text()
    if s.count(old)!=1:raise SystemExit(f'{path}: replacement is ambiguous or absent: {old[:80]}')
    p.write_text(s.replace(old,new))

# At the end gv.e can be past the last exercise. Never relocate a receipt's
# .gdica into the now-hidden exercise-instruction panel.
replace('app/aluno-skin.js',
"if(fresh){var technique=$('gTec');instr.innerHTML='';tips.innerHTML='';instr.dataset.exercise=key;",
"if(fresh&&!c.s.fim){var technique=$('gTec');instr.innerHTML='';tips.innerHTML='';instr.dataset.exercise=key;")
replace('tests/test-aluno-template-fechamento.js',
"  console.log(passed+' verificações de fechamento passaram'",
"""  for (const completed of [0,1,3]) {
   const {p,ctx,errors,click}=await open(browser,390,'',data(90));
   for(let i=0;i<completed;i++){await click('#gSerie');if(i<completed-1)await p.evaluate(()=>__zeraDescanso());}
   // Same canonical path as the complete Personal integration: skip exercises
   // instead of completing every series, then explicitly reach the receipt.
   await p.evaluate(async()=>{for(let i=0;i<24;i++){if(document.getElementById('gFim'))break;const b=document.getElementById('gFecharTreino')||document.getElementById('gPularEx');if(b)b.click();await new Promise(resolve=>setTimeout(resolve,160));}});
   const text=await p.locator('#gMiolo').innerText();
   ok(await p.locator('#gMiolo .gdica').isVisible()&&['Séries feitas aqui','Cargas anotadas','Tempo de treino'].every(x=>text.includes(x)),completed+' séries: pular exercícios mantém o resumo numérico visível no recibo');
   ok(!(await p.locator('#gTemplatePanel-instructions').textContent()).includes('Séries feitas aqui'),completed+' séries: recibo não é transferido para a aba de instruções escondida');
   ok(await p.evaluate(expected=>GP.conta(GUIA[0].it[0],0)===expected&&GP.conta(GUIA[0].it[1],1)===0,completed),completed+' séries: encerrar com pendências não inventa conclusões');
   ok(await p.isVisible('#gFim')&&errors.length===0,completed+' séries: fechar permanece acessível e sem exceções');
   await ctx.close();
  }
  console.log(passed+' verificações de fechamento passaram'""")
