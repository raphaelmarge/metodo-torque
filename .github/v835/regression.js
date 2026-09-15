 // O fim do salvamento precisa acontecer antes de o editor aceitar outro rascunho.
 // Reabertura no mesmo turno reproduz deterministicamente o timer obsoleto.
 const fastBefore=await p.evaluate(()=>writes.length);
 const fast=await p.evaluate(()=>{
  const form=document.getElementById('qqNovoBox'),name=document.getElementById('qqNome'),save=document.getElementById('qqAdd');
  form.open=true;name.value='Modelo da sequência rápida';
  document.querySelectorAll('.qqCheck').forEach(c=>c.checked=c.value==='disp');
  save.click();
  const completed=!save.disabled&&!form.open;
  form.open=true;name.value='Próximo rascunho, não salvo';name.dispatchEvent(new Event('input',{bubbles:true}));
  return completed;
 });
 await p.waitForTimeout(50);
 ok(fast,'Salvamento finaliza antes de aceitar a reabertura do editor');
 ok(await p.locator('#qqNovoBox').evaluate(el=>el.open)&&await p.inputValue('#qqNome')==='Próximo rascunho, não salvo','Conclusão anterior não fecha nem limpa o novo rascunho');
 ok(await p.evaluate(()=>writes.length)===fastBefore+1,'Reabertura não grava o novo rascunho nem duplica o modelo anterior');
