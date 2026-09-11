from pathlib import Path
import hashlib

before={'app/aluno-builder.js':'e646efbb137b98ac57b9cb41d9448ae4043e09f9','tests/test-calendario-alimentacao.js':'ed6a445d9f76f0fe333b932ab43929ff61ec7675','tests/test-aluno-evolucao-experiencia.js':'bb90ac06aec341400a0d0e0bddc72e17caf1cc5f'}
after={'app/aluno-builder.js':'06135b9683b633aaa09f5edee46a1fc3c3077a59','tests/test-calendario-alimentacao.js':'0b167354d10e19130e6eab66140c24c85aebb1c4','tests/test-aluno-evolucao-experiencia.js':'7e05c0dc5bc0eda09ae980328fa65c0e14aec7af'}
def sha(p):
 b=Path(p).read_bytes();return hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()
for p,h in before.items():assert sha(p)==h,'Base mudou: '+p
p=Path('app/aluno-builder.js');s=p.read_text()
a='      "function pintaMapaMes(f){var el=document.getElementById(\'mapaAno\');if(!el)return;f=f||L(\'ptfeitos\',{});" +'
b=a+'\n      "var focoMapa=document.activeElement&&el.contains(document.activeElement)?document.activeElement.id:\'\';" +'
assert s.count(a)==1;s=s.replace(a,b)
a='      "var bp=document.getElementById(\'mapProx\');if(bp)bp.addEventListener(\'click\',function(){if(mapMes>0){mapMes--;pintaMapaMes();}});}" +'
b='''      "var bp=document.getElementById('mapProx');if(bp)bp.addEventListener('click',function(){if(mapMes>0){mapMes--;pintaMapaMes();}});" +
      "if(focoMapa==='mapAnt'||focoMapa==='mapProx'){var focoNovo=document.getElementById(focoMapa);if(focoNovo&&focoNovo.disabled)focoNovo=ba;if(focoNovo)focoNovo.focus({preventScroll:true});}}" +'''
assert s.count(a)==1;p.write_text(s.replace(a,b))
p=Path('tests/test-calendario-alimentacao.js');s=p.read_text()
a=" const after=await snapshot(p);\n await p.evaluate(()=>{window.__trocaSec('evolucao');window.__evSub('conq');});await p.locator('[data-cal-dia=\"'+TODAY+'\"]').click();"
b=""" const after=await snapshot(p);
 await p.evaluate(()=>{window.__trocaSec('evolucao');window.__evSub('conq');});
 await p.locator('#mapAnt').focus();await p.keyboard.press('Enter');
 eq(await p.evaluate(()=>document.activeElement.id),'mapAnt','mês anterior conserva foco de teclado após repintar os dias');
 await p.keyboard.press('Enter');eq(await p.evaluate(()=>window.__mapaMes.mes()),2,'teclado continua navegando a partir da seta focada');
 await p.locator('#mapProx').focus();await p.keyboard.press('Enter');
 eq(await p.evaluate(()=>document.activeElement.id),'mapProx','próximo mês conserva foco enquanto pode avançar');
 await p.keyboard.press('Enter');
 eq(await p.evaluate(()=>document.activeElement.id),'mapAnt','ao chegar ao mês atual, foco vai para a seta habilitada');
 ok(await p.locator('#mapProx').isDisabled(),'fim da navegação não habilita mês futuro indevidamente');
 await p.evaluate(()=>window.__mapaMes.pinta());eq(await p.evaluate(()=>document.activeElement.id),'mapAnt','atualização do calendário conserva foco da navegação');
 await p.locator('#navMenuApp').focus();await p.evaluate(()=>window.__mapaMes.pinta());
 eq(await p.evaluate(()=>document.activeElement.id),'navMenuApp','atualização não rouba o foco de outra área do app');
 eq(await snapshot(p),after,'navegação de teclado não grava dados de treino ou alimentação');
 await p.locator('[data-cal-dia="'+TODAY+'"]').click();"""
assert s.count(a)==1;p.write_text(s.replace(a,b))
p=Path('tests/test-aluno-evolucao-experiencia.js');s=p.read_text()
a=" await page.locator('#mapAnt').click();eq(await page.evaluate(()=>window.__mapaMes.mes()),1,'Mês anterior seleciona agosto');"
b=a+"\n eq(await page.evaluate(()=>document.activeElement.id),'mapAnt','Navegação mensal conserva o foco da seta após repintar os dias');"
assert s.count(a)==1;p.write_text(s.replace(a,b))
for p,h in after.items():assert sha(p)==h,'Saída divergiu: '+p
print('Integridade do ajuste de foco confirmada.')
